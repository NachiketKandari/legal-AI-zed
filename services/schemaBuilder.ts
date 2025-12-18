
import { Type } from "@google/genai";

/**
 * FULL DATA DEFINITIONS
 * This serves as the "Master Dictionary" of all schema definitions.
 * We pick and choose from here to build the scoped schema.
 */
const SCHEMA_DEFINITIONS: Record<string, any> = {
    // CONTACT
    "contact": {
        type: Type.OBJECT,
        properties: {
            full_name: { type: Type.STRING },
            email: { type: Type.STRING },
        }
    },
    // INCIDENT
    "incident": {
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
    // LIABILITY
    "liability": {
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
    // DAMAGES
    "damages": {
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
    // ADMIN
    "admin": {
        type: Type.OBJECT,
        properties: {
            insurance_status: { type: Type.BOOLEAN },
            prior_representation: { type: Type.BOOLEAN },
            conflict_party: { type: Type.STRING },
        }
    }
};

/**
 * Generates a focused JSON Schema that ONLY allows extraction of the specific fields
 * requested in the missingSlots list.
 * 
 * @param missingSlots List of dot-notation field IDs (e.g. ["contact.full_name", "incident.accident_date"])
 * @returns A strictly scoped JSON schema object
 */
/**
 * Generates a FLAT focused JSON Schema that ONLY allows extraction of the specific fields.
 * Example result: { "contact.full_name": { type: STRING }, "incident.accident_date": { type: STRING } }
 */
export const generateScopedSchema = (missingSlots: string[]): any => {

    // Base Structure is now a flat object with response_text
    const scopedSchema: any = {
        type: Type.OBJECT,
        properties: {
            response_text: { type: Type.STRING }
        },
        required: ["response_text"] // Enforce the model to speak
    };

    const props = scopedSchema.properties;
    const requiredFields: string[] = ["response_text"];

    // Iterate through requested slots and inject ONLY those definitions
    missingSlots.forEach(slotId => {
        const [vectorKey, fieldKey] = slotId.split('.');

        // Fetch the Master Definition
        const masterVector = SCHEMA_DEFINITIONS[vectorKey];
        if (masterVector && masterVector.properties && masterVector.properties[fieldKey]) {
            // Inject the field definition using the flat dot-notation ID as the key
            // MODIFICATION: Force nullable: true for all fields in this scoped schema
            const fieldDef = { ...masterVector.properties[fieldKey], nullable: true };
            props[slotId] = fieldDef;
            requiredFields.push(slotId); // Force valid JSON to include this key
        }
    });

    // Enforce that ALL requested keys key MUST be present (value can be null)
    scopedSchema.required = requiredFields;

    return scopedSchema;
};
