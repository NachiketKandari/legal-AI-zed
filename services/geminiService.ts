
import { GoogleGenAI, Type } from "@google/genai";
import { CaseFile, IntakeTurnResponse, AuditResponse } from '../types';
import { getSystemInstructionForSlot } from './stateLogic';
import { INTAKE_STEPS, MOCK_CLIENT_DB } from '../constants';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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

export const processTurn = async (
  history: { role: string; content: string }[],
  currentCaseFile: CaseFile,
  userMessage: string
): Promise<IntakeTurnResponse> => {
  
  // 1. GENERATE DYNAMIC SOP
  const sopChecklist = INTAKE_STEPS.map((step, index) => {
    // @ts-ignore
    const val = currentCaseFile[step.vector.toLowerCase()]?.[step.id.split('.')[1]];
    
    // Visual helper for the prompt to see what's partially filled
    let status = "Pending";
    if (val !== null) {
        if (typeof val === 'object') {
            // For Structs, check specific fields
            if (step.id === 'damages.injury_details') status = (val.has_injury !== null) ? (val.has_injury && !val.description ? "Partial (Missing Desc)" : "Filled") : "Pending";
            else if (step.id === 'liability.fault_admission') status = (val.status !== null) ? (val.status === 'Yes' && !val.statement ? "Partial (Missing Statement)" : "Filled") : "Pending";
            else status = "Filled";
        } else {
            status = "Filled";
        }
    }
    
    const instruction = getSystemInstructionForSlot(step.id);
    return `Step ${index + 1}: [${step.id}] is ${status}.\n      -> TARGET: "${instruction}"`;
  }).join('\n');

  // 2. SYSTEM PROMPT
  const systemInstruction = `
    You are a Neuro-Symbolic Legal Intake Agent. 
    
    ### 1. LONG-TERM MEMORY (CURRENT CASE FILE)
    ${JSON.stringify(currentCaseFile, null, 2)}

    ### 2. WORKFLOW (SOP)
    ${sopChecklist}

    ### 3. EXECUTION PROTOCOL
    A. **DATA EXTRACTION**: 
       - Parse Input: "${userMessage}"
       - **STRUCT RULE**: For complex fields (Injury, Hospital, Wages, Fault):
         - If user says "Yes", set boolean to true AND extract the Detail. 
         - **If user says "Yes" but gives NO detail**: Set boolean to true, leave Detail null. (The system will prompt again).
         - If user says "No", set boolean to false, Detail to null.
       - **ADDITIVE DATA**: If appending to an existing description, merge strings.

    B. **VERIFICATION TRIGGER**:
       - If you extracted a Detail (e.g. injury description), summarize it in 'response_text' and ask "Is that everything?"

    C. **NEXT ACTION**:
       - Focus on the FIRST 'Pending' or 'Partial' step in the SOP.

    D. **RESPONSE**:
       - Ask the Question for the Active Step.
  `;

  // 3. UPDATED SCHEMA
  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      thought_trace: { type: Type.STRING },
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
      next_system_action: { type: Type.STRING },
      response_text: { type: Type.STRING },
    },
    required: ["thought_trace", "extracted_data", "response_text"],
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

    const cleanText = cleanJsonResponse(response.text || "{}");
    const parsed = JSON.parse(cleanText) as IntakeTurnResponse;
    
    if (!parsed.extracted_data) parsed.extracted_data = {};
    if (!parsed.response_text) parsed.response_text = "I'm having trouble understanding. Could you please repeat that?";

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

    return parsed;

  } catch (error: any) {
    console.error("Gemini Service Error (Fast Model):", error);
    return {
      thought_trace: "System Error or JSON Parse Failure",
      extracted_data: {},
      next_system_action: "ERROR",
      response_text: "System Error. Please try again."
    };
  }
};

/**
 * AUDIT SERVICE
 * Updated schema to match new struct types.
 */
export const auditCaseFile = async (
    currentCaseFile: CaseFile,
    history: { role: string; content: string }[]
): Promise<AuditResponse> => {
    
    const today = new Date();
    const systemInstruction = `
      You are a Senior Legal Data Auditor.
      Current Date: ${today.toISOString().split('T')[0]}
      
      ### OBJECTIVES:
      1. **FIX DATES**: Convert relative dates to YYYY-MM-DD.
      2. **VALIDATE STRUCTS**: 
         - If 'injury_details.has_injury' is true but 'description' is null -> Invalidate.
         - If 'fault_admission.status' is Yes but 'statement' is null -> Invalidate.
      
      ### ACTION:
      - Set 'corrected_data' to fix values or set to NULL if vague.
      - If fixing a value (like date), provide 'verification_prompt'.
      - If invalidating, provide 'flagged_issue'.
      
      ### INPUT DATA:
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
                        }
                    },
                    damages: {
                        type: Type.OBJECT,
                        properties: {
                             injury_details: { 
                                 type: Type.OBJECT, 
                                 properties: { has_injury: {type:Type.BOOLEAN}, description: {type:Type.STRING} },
                                 nullable: true 
                             },
                        }
                    }
                }
            },
            flagged_issue: { type: Type.STRING, nullable: true },
            verification_prompt: { type: Type.STRING, nullable: true }
        }
    };

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview', 
            contents: [
                { role: 'user', parts: [{ text: "Perform Audit." }] }
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
        return parsed;

    } catch (error) {
        console.error("Audit Error", error);
        return {
            audit_reasoning: "Failed",
            corrected_data: {},
            flagged_issue: null,
            verification_prompt: null
        };
    }
};
