
import { GoogleGenAI, Type } from "@google/genai";
import { CaseFile, IntakeTurnResponse, AuditResponse, LatencyMetrics, LogEntry } from '../types';
import { getSystemInstructionForSlot, getNextNMissingSlots } from './stateLogic';
import { INTAKE_STEPS, MOCK_CLIENT_DB } from '../constants';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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

    // Log input - show the actual prompt going to the model
    log('responder', 'input', `Prompt: "${userMessage}"`, {
        systemPrompt: `Legal intake. Extract data, ask next question. Pending: ${nextSlots.map(s => s.id).join(', ')}`,
        userMessage,
        pendingQuestions: nextSlots.map(s => s.id)
    });

    // 2. MINIMAL SYSTEM PROMPT (Optimized for low token output)
    const systemInstruction = `Legal intake. Extract data, ask next question.
Pending: ${scopedSopChecklist}
Rules: Extract max 3 fields. Ask the first pending question. Be brief.`;

    promptPrepTime = performance.now() - promptPrepStart;

    // 3. MINIMAL RESPONSE SCHEMA (Only extracted_data + response_text)
    // Removed thought_trace and next_system_action to reduce output tokens
    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            extracted_data: {
                type: Type.OBJECT,
                properties: {
                    contact: {
                        type: Type.OBJECT,
                        properties: {
                            full_name: { type: Type.STRING },
                            phone_number: { type: Type.STRING },
                            email: { type: Type.STRING },
                        }
                    },
                    incident: {
                        type: Type.OBJECT,
                        properties: {
                            accident_date: { type: Type.STRING },
                            accident_time: { type: Type.STRING },
                            location_jurisdiction: { type: Type.STRING },
                            police_report_filed: { type: Type.BOOLEAN },
                            weather_conditions: { type: Type.STRING },
                            vehicle_description: { type: Type.STRING },
                        }
                    },
                    liability: {
                        type: Type.OBJECT,
                        properties: {
                            fault_admission: {
                                type: Type.OBJECT,
                                properties: {
                                    status: { type: Type.STRING, enum: ["Yes", "No", "Unknown"] },
                                    statement: { type: Type.STRING }
                                }
                            },
                            citation_issued: { type: Type.BOOLEAN },
                            witness_presence: { type: Type.BOOLEAN },
                            claimant_role: { type: Type.STRING, enum: ["Driver", "Passenger", "Pedestrian"] },
                        }
                    },
                    damages: {
                        type: Type.OBJECT,
                        properties: {
                            injury_details: {
                                type: Type.OBJECT,
                                properties: {
                                    has_injury: { type: Type.BOOLEAN },
                                    description: { type: Type.STRING }
                                }
                            },
                            medical_treatment: { type: Type.BOOLEAN },
                            hospitalization_details: {
                                type: Type.OBJECT,
                                properties: {
                                    was_hospitalized: { type: Type.BOOLEAN },
                                    duration: { type: Type.STRING }
                                }
                            },
                            lost_wages_details: {
                                type: Type.OBJECT,
                                properties: {
                                    has_lost_wages: { type: Type.BOOLEAN },
                                    amount: { type: Type.NUMBER }
                                }
                            },
                        }
                    },
                    admin: {
                        type: Type.OBJECT,
                        properties: {
                            insurance_status: { type: Type.BOOLEAN },
                            prior_representation: { type: Type.BOOLEAN },
                            conflict_party: { type: Type.STRING },
                        }
                    },
                    status: { type: Type.STRING, enum: ["QUALIFICATION", "INTAKE", "REJECTED", "REFERRED", "CLOSED"] }
                }
            },
            response_text: { type: Type.STRING },
        },
        required: ["extracted_data", "response_text"],
    };

    try {
        const RECENT_HISTORY_LIMIT = 10;
        const recentHistory = history.slice(-RECENT_HISTORY_LIMIT);

        const apiHistory = recentHistory.length > 0
            ? recentHistory.map(m => ({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: m.content }]
            })).filter((_, i) => i !== 0 || recentHistory[0].role !== 'model')
            : [];

        const apiCallStart = performance.now();

        const response = await ai.models.generateContent({
            model: 'gemini-flash-lite-latest',
            contents: [
                ...apiHistory,
                { role: 'user', parts: [{ text: userMessage }] }
            ],
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema,
                temperature: 0,
            }
        });

        apiCallTime = performance.now() - apiCallStart;

        // Log RAW output before parsing
        const rawOutput = response.text || "{}";
        log('responder', 'output', `Raw model response (${rawOutput.length} chars)`, {
            rawOutput: rawOutput.substring(0, 500) + (rawOutput.length > 500 ? '...' : '')
        });

        const parseStart = performance.now();
        const cleanText = cleanJsonResponse(rawOutput);
        const parsed = JSON.parse(cleanText) as IntakeTurnResponse;

        if (!parsed.extracted_data) parsed.extracted_data = {};
        if (!parsed.response_text) parsed.response_text = "I'm having trouble understanding. Could you please repeat that?";

        // Symbolic logic: Conflict check
        const extractedConflictParty = parsed.extracted_data.admin?.conflict_party;
        if (extractedConflictParty) {
            const isConflict = checkConflictInDb(extractedConflictParty);
            if (isConflict) {
                console.log(`[SYMBOLIC LOGIC] Conflict Detected: ${extractedConflictParty}`);
                parsed.extracted_data.status = 'REJECTED';
                parsed.extracted_data.rejection_reason = `Conflict of interest: ${extractedConflictParty}`;
                parsed.response_text = `I apologize, but we already represent ${extractedConflictParty}. Ethically, we cannot proceed. This session is closed.`;
                parsed.next_system_action = 'REJECTED_GENERIC';
            } else {
                if (parsed.extracted_data.status === 'REJECTED' && !parsed.extracted_data.admin?.prior_representation) {
                    parsed.extracted_data.status = 'INTAKE';
                }
            }
        }

        parseTime = performance.now() - parseStart;
        const totalTime = performance.now() - startTotal;

        // Log parsed output
        log('responder', 'output', `Parsed: ${parsed.response_text.substring(0, 50)}...`, {
            fieldsExtracted: Object.keys(parsed.extracted_data).length,
            responseText: parsed.response_text
        });

        return {
            ...parsed,
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
// THINKER (SLOW MODEL)
// ============================================================================
// Responsible for: Validating entire case file, correcting data, flagging issues
export const auditCaseFile = async (
    currentCaseFile: CaseFile,
    history: { role: string; content: string }[]
): Promise<AuditResponse> => {

    const today = new Date();

    // Log input
    log('thinker', 'input', 'Starting full case validation', {
        caseId: currentCaseFile.case_id,
        status: currentCaseFile.status,
        filledFields: Object.keys(currentCaseFile).length
    });

    const systemInstruction = `
      You are a Senior Legal Data Auditor (Thinker). You validate the ENTIRE case file.
      Current Date: ${today.toISOString().split('T')[0]}
      
      ### YOUR RESPONSIBILITIES
      1. **VALIDATE ALL DATA** in the case file
      2. **FIX DATES**: Convert relative dates to YYYY-MM-DD
      3. **VALIDATE ENUMS**: 
         - claimant_role MUST be: "Driver", "Passenger", or "Pedestrian"
         - fault_admission.status MUST be: "Yes", "No", or "Unknown"
      4. **VALIDATE STRUCTS**: 
         - If 'injury_details.has_injury' is true but 'description' is null -> Flag
         - If 'fault_admission.status' is Yes but 'statement' is null -> Flag
         - If 'hospitalization_details.was_hospitalized' is true but 'duration' is null -> Flag
         - If 'lost_wages_details.has_lost_wages' is true but 'amount' is null -> Flag
      
      ### ACTION
      - Set 'corrected_data' to fix values or set to NULL if vague
      - If fixing a value (like date), provide 'verification_prompt' to confirm with user
      - If invalidating, provide 'flagged_issue' describing what's wrong
      - Include 'validation_errors' array for all issues found
      
      ### FULL CASE FILE TO VALIDATE
      ${JSON.stringify(currentCaseFile, null, 2)}
    `;

    // Audit Schema matches Type.ts structures
    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            audit_reasoning: { type: Type.STRING },
            corrected_data: {
                type: Type.OBJECT,
                properties: {
                    incident: {
                        type: Type.OBJECT,
                        properties: {
                            accident_date: { type: Type.STRING, nullable: true },
                        }
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
                        }
                    },
                    damages: {
                        type: Type.OBJECT,
                        properties: {
                            injury_details: {
                                type: Type.OBJECT,
                                properties: { has_injury: { type: Type.BOOLEAN }, description: { type: Type.STRING } },
                                nullable: true
                            },
                        }
                    }
                }
            },
            flagged_issue: { type: Type.STRING, nullable: true },
            verification_prompt: { type: Type.STRING, nullable: true },
            validation_errors: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        field: { type: Type.STRING },
                        currentValue: { type: Type.STRING },
                        issue: { type: Type.STRING },
                        suggestion: { type: Type.STRING, nullable: true }
                    }
                },
                nullable: true
            }
        }
    };

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [
                { role: 'user', parts: [{ text: "Perform comprehensive validation of the case file." }] }
            ],
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema,
                temperature: 0.1,
            }
        });

        const cleanText = cleanJsonResponse(response.text || "{}");
        const parsed = JSON.parse(cleanText) as AuditResponse;
        if (!parsed.corrected_data) parsed.corrected_data = {};

        // Log output
        log('thinker', 'output', `Validation complete: ${parsed.validation_errors?.length || 0} issues found`, {
            reasoning: parsed.audit_reasoning,
            hasCorrections: Object.keys(parsed.corrected_data).length > 0,
            flaggedIssue: parsed.flagged_issue,
            validationErrors: parsed.validation_errors
        });

        return parsed;

    } catch (error) {
        console.error("Thinker Error", error);
        log('thinker', 'output', `ERROR: ${(error as any).message || 'Unknown error'}`, { error });

        return {
            audit_reasoning: "Failed",
            corrected_data: {},
            flagged_issue: null,
            verification_prompt: null,
            validation_errors: []
        };
    }
};
