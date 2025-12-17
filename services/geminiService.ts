
import { GoogleGenAI, Type } from "@google/genai";
import { CaseFile, IntakeTurnResponse, AuditResponse, LatencyMetrics, LogEntry, LLMConfig, LLMProvider, DEFAULT_MODELS, ApiCallLog } from '../types';
import { getSystemInstructionForSlot, getNextNMissingSlots, getNextMissingSlot, validateField } from './stateLogic';
import { generateScopedSchema } from './schemaBuilder';
import { INTAKE_STEPS, MOCK_CLIENT_DB } from '../constants';
import {
    addApiCallLog,
    getApiCallLogs,
    clearApiCallLogs,
    estimateTokenCount,
    callOpenAI,
    callClaude,
    callOllama,
    LLMResponse,
    DEFAULT_LLM_CONFIG
} from './llmProviders';

// Re-export for backward compatibility
export { getApiCallLogs, clearApiCallLogs };

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY || "" });

// ============================================================================
// LLM CONFIGURATION STATE
// ============================================================================
let currentLLMConfig: LLMConfig = DEFAULT_LLM_CONFIG;

export const setLLMConfig = (config: LLMConfig): void => {
    currentLLMConfig = { ...config };
    console.log(`[LLM CONFIG] Provider set to: ${config.provider}, Model: ${config.modelName || DEFAULT_MODELS[config.provider]}`);
};

export const getLLMConfig = (): LLMConfig => ({ ...currentLLMConfig });

// ============================================================================
// LOGGING UTILITY
// ============================================================================
let logBuffer: LogEntry[] = [];
const MAX_LOG_BUFFER = 50;

export const getLogBuffer = (): LogEntry[] => [...logBuffer];
export const clearLogBuffer = () => { logBuffer = []; };

const log = (
    model: 'responder' | 'thinker',
    direction: 'input' | 'output',
    summary: string,
    data?: any
): LogEntry => {
    const entry: LogEntry = {
        timestamp: Date.now(),
        model,
        direction,
        summary,
        data
    };

    // Console logging with clear labels
    const label = `[${model.toUpperCase()}][${direction.toUpperCase()}]`;
    console.log(`${label} ${summary}`, data ? JSON.stringify(data, null, 2) : '');

    // Buffer for UI display
    logBuffer.push(entry);
    if (logBuffer.length > MAX_LOG_BUFFER) {
        logBuffer.shift();
    }

    return entry;
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
const cleanJsonResponse = (text: string): string => {
    if (!text) return "{}";
    let cleaned = text.replace(/```json/gi, "").replace(/```/g, "");
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    } else {
        return "{}";
    }
    return cleaned.trim();
};

const checkConflictInDb = (name: string): boolean => {
    if (!name) return false;
    const normalizedInput = name.toLowerCase().trim();
    return MOCK_CLIENT_DB.some(client => client.toLowerCase() === normalizedInput);
};

// ============================================================================
// GEMINI INTERNAL CALL (with token logging)
// ============================================================================
const callGeminiInternal = async (
    systemInstruction: string,
    userMessage: string,
    apiHistory: any[],
    responseSchema: any,
    modelName: string = 'gemini-flash-lite-latest',
    stopSequences?: string[]
): Promise<LLMResponse> => {
    const response = await ai.models.generateContent({
        model: modelName,
        contents: [
            ...apiHistory,
            { role: 'user', parts: [{ text: userMessage }] }
        ],
        config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema,
            temperature: 0,
            thinkingConfig: { thinkingBudget: 0 },
            stopSequences
        }
    });

    const rawOutput = response.text || "{}";

    // Gemini API returns usage metadata
    const usageMetadata = (response as any).usageMetadata || {};

    return {
        text: rawOutput,
        inputTokens: usageMetadata.promptTokenCount || estimateTokenCount(systemInstruction + userMessage),
        outputTokens: usageMetadata.candidatesTokenCount || estimateTokenCount(rawOutput),
        rawResponse: response
    };
};

// ============================================================================
// RESPONDER (FAST MODEL)
// ============================================================================
// Responsible for: Taking user response, filling max 3 fields, asking next question
export const processTurn = async (
    history: { role: string; content: string }[],
    currentCaseFile: CaseFile,
    userMessage: string
): Promise<IntakeTurnResponse & { latencyMetrics?: LatencyMetrics }> => {

    const startTotal = performance.now();
    let promptPrepTime = 0;
    let apiCallTime = 0;
    let parseTime = 0;

    // -------------------------------------------------------------------------
    // 1. GENERATE SCOPED SOP (NEXT 3 QUESTIONS ONLY)
    // -------------------------------------------------------------------------
    const promptPrepStart = performance.now();

    const nextSlots = getNextNMissingSlots(currentCaseFile, 3);

    // Build scoped checklist for only the next 3 questions
    const scopedSopChecklist = nextSlots.length > 0
        ? nextSlots.map((slot, index) =>
            `Step ${index + 1}: [${slot.id}] is Pending.\n      -> TARGET: "${slot.instruction}"`
        ).join('\n')
        : 'ALL STEPS COMPLETE - Thank user and summarize case.';

    // 2. CONCISE SYSTEM PROMPT (Hybrid: Flattened Data + LLM Dialog)
    const constraints = nextSlots.map(s => {
        if (s.id === 'contact.full_name') return ` - ${s.id}: Must be 2+ words (First + Last Name).`;
        if (s.id === 'incident.location_jurisdiction') return ` - ${s.id}: Must include City AND State/Region.`;
        return ` - ${s.id}`;
    }).join('\n');

    const systemInstruction = `Extract data into flat JSON keys.
Allowed Keys & Constraints:
${constraints}

You MUST also include a "response_text" key.
CRITICAL RULES:
1. If an extracted value fails its constraint (e.g. only 1 name provided), do NOT extract it (omit key) and ask specifically for the missing detail in "response_text".
2. If all values are valid, ask for the *FIRST* missing key in the list above. Do NOT skip steps.
3. Minified JSON only.`;

    const fullPrompt = `System: ${systemInstruction}\n\nUser: ${userMessage}`;

    // Log input
    log('responder', 'input', `Extracting from: "${userMessage}"`, {
        allowedKeys: nextSlots.map(s => s.id),
        userMessage
    });

    promptPrepTime = performance.now() - promptPrepStart;

    // 3. DYNAMIC FLAT SCHEMA
    const requestedFieldIds = nextSlots.map(s => s.id);
    const responseSchema = generateScopedSchema(requestedFieldIds);

    try {
        const RECENT_HISTORY_LIMIT = 6; // Shorten history for speed
        const recentHistory = history.slice(-RECENT_HISTORY_LIMIT);

        const apiHistory = recentHistory.length > 0
            ? recentHistory.map(m => ({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: m.content }]
            })).filter((_, i) => i !== 0 || recentHistory[0].role !== 'model')
            : [];

        const apiCallStart = performance.now();

        let llmResponse: LLMResponse;
        const provider = currentLLMConfig.provider;
        const modelName = currentLLMConfig.modelName || DEFAULT_MODELS[provider];

        // =====================================================================
        // PROVIDER-SPECIFIC API CALLS
        // =====================================================================
        if (provider === 'internal') {
            llmResponse = await callGeminiInternal(
                systemInstruction,
                userMessage,
                apiHistory,
                responseSchema,
                modelName
            );
        } else if (provider === 'openai') {
            llmResponse = await callOpenAI(userMessage, systemInstruction, currentLLMConfig, responseSchema);
        } else if (provider === 'claude') {
            llmResponse = await callClaude(userMessage, systemInstruction, currentLLMConfig);
        } else if (provider === 'local') {
            llmResponse = await callOllama(userMessage, systemInstruction, currentLLMConfig);
        } else {
            throw new Error(`Unknown provider: ${provider}`);
        }

        apiCallTime = performance.now() - apiCallStart;

        // =====================================================================
        // LOGGING & PARSING
        // =====================================================================
        addApiCallLog({
            timestamp: Date.now(),
            model: 'responder',
            provider,
            modelName,
            inputPrompt: fullPrompt,
            inputTokens: llmResponse.inputTokens,
            outputString: llmResponse.text,
            outputTokens: llmResponse.outputTokens,
            timeTakenMs: Math.round(apiCallTime)
        });

        const parseStart = performance.now();
        const cleanText = cleanJsonResponse(llmResponse.text);
        const flatData = JSON.parse(cleanText) as Record<string, any>;

        // Separate response_text from data fields
        const response_text = flatData.response_text || "I'm sorry, I didn't catch that. Could you please repeat?";
        delete flatData.response_text; // Remove from data so it doesn't try to map to vectors

        // MAP FLAT DATA -> NESTED CaseFile structure
        const nestedExtraction: Partial<CaseFile> = {};
        Object.entries(flatData).forEach(([slotId, value]) => {
            // SYMBOLIC VALIDATION LAYER (Hard Enforcement)
            if (!validateField(slotId, value)) {
                log('responder', 'output', `[VALIDATION REJECT] ${slotId} constraint failed`, { value });
                return; // Skip this field (effectively deleting it from extraction)
            }

            const [vector, field] = slotId.split('.');
            if (vector && field) {
                if (!nestedExtraction[vector as keyof CaseFile]) {
                    (nestedExtraction as any)[vector] = {};
                }
                (nestedExtraction as any)[vector][field] = value;
            }
        });

        // UPDATE TEMPORARY CASE FILE (for conflict check only now)
        const updatedCaseFile = { ...currentCaseFile };
        Object.entries(nestedExtraction).forEach(([vector, fields]) => {
            if (fields && typeof fields === 'object') {
                (updatedCaseFile as any)[vector] = { ...(updatedCaseFile as any)[vector], ...(fields as any) };
            }
        });

        // NO LOCAL DIALOG GENERATION - We use the LLM's response_text directly

        // Conflict check remains symbolic
        const extractedConflictParty = flatData["admin.conflict_party"];
        if (extractedConflictParty) {
            const isConflict = checkConflictInDb(extractedConflictParty);
            if (isConflict) {
                nestedExtraction.status = 'REJECTED';
                (nestedExtraction as any).admin = { ...(nestedExtraction as any).admin, conflict_party: extractedConflictParty };
                return {
                    extracted_data: nestedExtraction,
                    response_text: `I apologize, but we already represent ${extractedConflictParty}. Ethically, we cannot proceed.`,
                    next_system_action: 'REJECTED_GENERIC'
                };
            }
        }

        parseTime = performance.now() - parseStart;
        const totalTime = performance.now() - startTotal;

        return {
            extracted_data: nestedExtraction,
            response_text,
            latencyMetrics: {
                promptPrep: Math.round(promptPrepTime),
                apiCall: Math.round(apiCallTime),
                parsing: Math.round(parseTime),
                total: Math.round(totalTime)
            }
        };

    } catch (error: any) {
        console.error("Gemini Service Error (Responder):", error);
        log('responder', 'output', `ERROR: ${error.message || 'Unknown error'}`, { error: error.message });

        // Log error to API call buffer
        addApiCallLog({
            timestamp: Date.now(),
            model: 'responder',
            provider: currentLLMConfig.provider,
            modelName: currentLLMConfig.modelName || DEFAULT_MODELS[currentLLMConfig.provider],
            inputPrompt: fullPrompt,
            inputTokens: estimateTokenCount(fullPrompt),
            outputString: '',
            outputTokens: 0,
            timeTakenMs: Math.round(performance.now() - startTotal),
            error: error.message || 'Unknown error'
        });

        return {
            thought_trace: "System Error or JSON Parse Failure",
            extracted_data: {},
            next_system_action: "ERROR",
            response_text: "System Error. Please try again.",
            latencyMetrics: {
                promptPrep: Math.round(promptPrepTime),
                apiCall: Math.round(apiCallTime),
                parsing: Math.round(parseTime),
                total: Math.round(performance.now() - startTotal)
            }
        };
    }
};

// ============================================================================
// THINKER (SLOW MODEL) - Always uses Gemini internal API
// ============================================================================
// ============================================================================
// THINKER (SLOW MODEL) - Always uses Gemini internal API with REASONING
// ============================================================================
// Responsible for: Validating entire case file, correcting data, flagging issues
export const auditCaseFile = async (
    currentCaseFile: CaseFile,
    history: { role: string; content: string }[]
): Promise<AuditResponse> => {

    const startTotal = performance.now();
    const today = new Date();

    // Log input
    log('thinker', 'input', 'Starting full case validation', {
        caseId: currentCaseFile.case_id,
        status: currentCaseFile.status,
        filledFields: Object.keys(currentCaseFile).length
    });

    const systemInstruction = `
      You are a Senior Legal Data Auditor (Thinker). You validate the ENTIRE case file against the chat history.
      Current Date: ${today.toISOString().split('T')[0]}
      
      ### PRIMARY OBJECTIVES
      1. **BACKGROUND EXTRACTION**: The Responder only looks at the next 3 questions. scan the CHAT HISTORY for ANY information that belongs in the Case File but is currently null. If found, ADD IT to 'corrected_data'.
      2. **VALIDATE & CORRECT**: Fix dates (relative -> YYYY-MM-DD) and logical inconsistencies.
      3. **STRICT ENUM ENFORCEMENT**: 
         - checking 'fault_admission.status' (Yes/No/Unknown). If user words are vague (e.g. "I think so", "maybe"), set it to NULL (do not guess).
         - checking 'claimant_role' (Driver/Passenger/Pedestrian).
         - If an enum is currently filled but contradicts history, CORRECT IT.
      4. **STRICT FIELD COMPLETENESS**:
         - **contact.full_name**: MUST contain at least First and Last name. If only one name provided (e.g. "Nachiket" or "Smith"), set it to NULL.
         - **incident.location_jurisdiction**: MUST contain City AND State. If subjective (e.g. "around here", "down the street"), set it to NULL.
      5. **STRUCT VALIDATION**:
         - If 'injury_details.has_injury' is true but 'description' is missing -> Set 'has_injury' to NULL (force re-ask).
         - If 'fault_admission.status' is Yes but 'statement' is missing -> Set 'status' to NULL (force re-ask).
      
      ### ACTIONABLE OUTPUT
      - **corrected_data**: A Partial<CaseFile> containing specific vector updates.
        - To INVALIDATE a field (force re-ask), set it to null explicitly.
        - To FILL a field missed by Responder, provide the value.
      - **audit_reasoning**: Brief explanation of your logic.
      
      ### FULL CASE FILE
      ${JSON.stringify(currentCaseFile, null, 2)}
    `;

    // Filter relevant history key for context
    const chatContext = history.map(h => `${h.role.toUpperCase()}: ${h.content}`).join('\n');
    const fullPrompt = `System: ${systemInstruction}\n\nChat History (Most Recent First):\n${chatContext}`;

    // Audit Schema matches Type.ts structures
    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            audit_reasoning: { type: Type.STRING },
            corrected_data: {
                type: Type.OBJECT,
                properties: {
                    contact: {
                        type: Type.OBJECT,
                        properties: {
                            full_name: { type: Type.STRING, nullable: true },
                            email: { type: Type.STRING, nullable: true },
                            phone_number: { type: Type.STRING, nullable: true }
                        },
                        nullable: true
                    },
                    incident: {
                        type: Type.OBJECT,
                        properties: {
                            accident_date: { type: Type.STRING, nullable: true },
                            accident_time: { type: Type.STRING, nullable: true },
                            location_jurisdiction: { type: Type.STRING, nullable: true },
                            police_report_filed: { type: Type.BOOLEAN, nullable: true },
                            weather_conditions: { type: Type.STRING, nullable: true },
                            vehicle_description: { type: Type.STRING, nullable: true },
                        },
                        nullable: true
                    },
                    liability: {
                        type: Type.OBJECT,
                        properties: {
                            fault_admission: {
                                type: Type.OBJECT,
                                properties: {
                                    status: { type: Type.STRING, enum: ["Yes", "No", "Unknown"], nullable: true },
                                    statement: { type: Type.STRING, nullable: true }
                                },
                                nullable: true
                            },
                            claimant_role: { type: Type.STRING, enum: ["Driver", "Passenger", "Pedestrian"], nullable: true },
                            citation_issued: { type: Type.BOOLEAN, nullable: true },
                            witness_presence: { type: Type.BOOLEAN, nullable: true }
                        },
                        nullable: true
                    },
                    damages: {
                        type: Type.OBJECT,
                        properties: {
                            injury_details: {
                                type: Type.OBJECT,
                                properties: { has_injury: { type: Type.BOOLEAN, nullable: true }, description: { type: Type.STRING, nullable: true } },
                                nullable: true
                            },
                            medical_treatment: { type: Type.BOOLEAN, nullable: true },
                            hospitalization_details: {
                                type: Type.OBJECT,
                                properties: { was_hospitalized: { type: Type.BOOLEAN, nullable: true }, duration: { type: Type.STRING, nullable: true } },
                                nullable: true
                            },
                            lost_wages_details: {
                                type: Type.OBJECT,
                                properties: { has_lost_wages: { type: Type.BOOLEAN, nullable: true }, amount: { type: Type.NUMBER, nullable: true } },
                                nullable: true
                            }
                        },
                        nullable: true
                    },
                    admin: {
                        type: Type.OBJECT,
                        properties: {
                            insurance_status: { type: Type.BOOLEAN, nullable: true },
                            prior_representation: { type: Type.BOOLEAN, nullable: true },
                            conflict_party: { type: Type.STRING, nullable: true },
                        },
                        nullable: true
                    },
                },
                nullable: true
            },
            // We keep these for schema compatibility but will likely ignore in UI
            flagged_issue: { type: Type.STRING, nullable: true },
            verification_prompt: { type: Type.STRING, nullable: true },
        }
    };

    try {
        const apiCallStart = performance.now();
        const modelName = 'gemini-2.5-flash'; // Fallback to stable highly capable model

        const response = await ai.models.generateContent({
            model: modelName,
            contents: [
                { role: 'user', parts: [{ text: fullPrompt }] }
            ],
            config: {
                systemInstruction, // Valid for 2.0 Flash
                responseMimeType: "application/json",
                responseSchema,
                temperature: 0.1,
            }
        });

        const apiCallTime = performance.now() - apiCallStart;
        const rawOutput = response.text || "{}";

        // Get usage metadata
        const usageMetadata = (response as any).usageMetadata || {};
        const inputTokens = usageMetadata.promptTokenCount || estimateTokenCount(fullPrompt);
        const outputTokens = usageMetadata.candidatesTokenCount || estimateTokenCount(rawOutput);

        // =====================================================================
        // COMPREHENSIVE API CALL LOGGING FOR THINKER
        // =====================================================================
        const apiLog: ApiCallLog = {
            timestamp: Date.now(),
            model: 'thinker',
            provider: 'internal',
            modelName: modelName,
            inputPrompt: fullPrompt,
            inputTokens: inputTokens,
            outputString: rawOutput,
            outputTokens: outputTokens,
            timeTakenMs: Math.round(apiCallTime)
        };
        addApiCallLog(apiLog);

        const cleanText = cleanJsonResponse(rawOutput);
        const parsed = JSON.parse(cleanText) as AuditResponse;
        if (!parsed.corrected_data) parsed.corrected_data = {};

        // Log output
        log('thinker', 'output', `Validation complete: ${Object.keys(parsed.corrected_data).length} corrections (${outputTokens} tokens, ${Math.round(apiCallTime)}ms)`, {
            reasoning: parsed.audit_reasoning,
            corrections: parsed.corrected_data,
            inputTokens,
            outputTokens,
            timeTakenMs: Math.round(apiCallTime)
        });

        return parsed;

    } catch (error) {
        console.error("Thinker Error", error);
        log('thinker', 'output', `ERROR: ${(error as any).message || 'Unknown error'}`, { error });

        // Log error to API call buffer
        addApiCallLog({
            timestamp: Date.now(),
            model: 'thinker',
            provider: 'internal',
            modelName: 'gemini-2.5-flash',
            inputPrompt: fullPrompt,
            inputTokens: estimateTokenCount(fullPrompt),
            outputString: '',
            outputTokens: 0,
            timeTakenMs: Math.round(performance.now() - startTotal),
            error: (error as any).message || 'Unknown error'
        });

        return {
            audit_reasoning: "Failed",
            corrected_data: {},
            flagged_issue: null,
            verification_prompt: null,
        };
    }
};
