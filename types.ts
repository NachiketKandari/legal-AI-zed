
/**
 * THE LEGAL INTAKE ONTOLOGY
 * -------------------------
 * This file acts as the "Single Source of Truth" for the application state.
 * Both the React UI (Visualizer) and the Gemini Logic (Symbolic Extraction)
 * rely on these exact interface definitions to maintain synchronization.
 */

// --- 1. COMPLEX DATA STRUCTURES ---

export interface FaultAdmission {
  status: 'Yes' | 'No' | 'Unknown' | null;
  statement: string | null; // e.g., "He said sorry"
}

export interface InjuryDetails {
  has_injury: boolean | null;
  description: string | null; // e.g., "Broken leg"
}

export interface HospitalizationDetails {
  was_hospitalized: boolean | null;
  duration: string | null; // e.g., "Overnight", "3 days"
}

export interface LostWagesDetails {
  has_lost_wages: boolean | null;
  amount: number | null; // e.g., 5000
}

// --- 2. DOMAIN VECTORS ---

/**
 * CONTACT: Basic user identification (Asked First).
 */
export interface ContactVector {
  full_name: string | null;
  phone_number: string | null;
  email: string | null;
}

/** 
 * FACTS: The raw details of the event. 
 */
export interface IncidentVector {
  accident_date: string | null;      // STRICT ISO8601 YYYY-MM-DD
  accident_time: string | null;      // "Morning", "Afternoon", or specific time
  location_jurisdiction: string | null; // City/State for legal jurisdiction logic
  police_report_filed: boolean | null;
  weather_conditions: string | null;
  vehicle_description: string | null; // e.g., "2015 Red Toyota Camry"
}

/** 
 * LIABILITY: Who is at fault? 
 */
export interface LiabilityVector {
  fault_admission: FaultAdmission; // STRUCT
  citation_issued: boolean | null;
  witness_presence: boolean | null;
  claimant_role: 'Driver' | 'Passenger' | 'Pedestrian' | null;
}

/** 
 * DAMAGES: The economic and non-economic harm. 
 */
export interface DamagesVector {
  injury_details: InjuryDetails; // STRUCT
  medical_treatment: boolean | null;
  hospitalization_details: HospitalizationDetails; // STRUCT
  lost_wages_details: LostWagesDetails; // STRUCT
}

/** 
 * ADMIN: Ethics and qualification rules. 
 */
export interface AdministrativeVector {
  insurance_status: boolean | null;
  prior_representation: boolean | null; // STOP CONDITION: We cannot talk if represented.
  conflict_party: string | null;        // Defendant name for conflict checks
}

// --- 3. THE CASE FILE ---

/**
 * The core state object representing a legal case.
 * This is the "Symbolic" reality that the AI attempts to fill.
 */
export interface CaseFile {
  case_id: string;
  status: 'QUALIFICATION' | 'INTAKE' | 'REJECTED' | 'REFERRED' | 'CLOSED';
  rejection_reason?: string;
  contact: ContactVector;
  incident: IncidentVector;
  liability: LiabilityVector;
  damages: DamagesVector;
  admin: AdministrativeVector;
}

// --- 4. COMMUNICATION TYPES ---

/**
 * Represents a single message in the chat history.
 */
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  thought?: string; // The "Chain of Thought" or reasoning log from the AI
}

/**
 * Structured output expected from the LLM (Fast Model).
 */
export interface IntakeTurnResponse {
  thought_trace: string;           
  extracted_data: Partial<CaseFile>; 
  next_system_action: string;      
  response_text: string;           
}

/**
 * Structured output expected from the Audit LLM (Slow/Thinking Model).
 */
export interface AuditResponse {
  audit_reasoning: string;
  corrected_data: Partial<CaseFile>; 
  flagged_issue: string | null; 
  verification_prompt: string | null; 
}
