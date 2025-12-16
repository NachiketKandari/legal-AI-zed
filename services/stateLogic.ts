
import { CaseFile } from '../types';
import { INTAKE_STEPS } from '../constants';

/**
 * ------------------------------------------------------------------
 * SYMBOLIC CONTROLLER (Finite State Machine)
 * ------------------------------------------------------------------
 * This represents the deterministic "Rules Engine" of the application.
 */

/**
 * Checks if a specific field is "Complete" based on business logic.
 * Handles primitive checks and complex struct validation.
 */
const isFieldComplete = (fieldId: string, value: any): boolean => {
  // 1. Basic Null Check
  if (value === null) return false;

  // 2. Complex Struct Logic
  
  // A. FAULT ADMISSION: If Yes, need statement.
  if (fieldId === 'liability.fault_admission') {
    if (value.status === null) return false;
    // If they admitted fault, we MUST have the statement/quote
    if (value.status === 'Yes' && !value.statement) return false;
    return true; 
  }

  // B. INJURIES: If Yes, need description.
  if (fieldId === 'damages.injury_details') {
    if (value.has_injury === null) return false;
    if (value.has_injury === true && !value.description) return false;
    return true;
  }

  // C. HOSPITALIZATION: If Yes, need duration.
  if (fieldId === 'damages.hospitalization_details') {
    if (value.was_hospitalized === null) return false;
    if (value.was_hospitalized === true && !value.duration) return false;
    return true;
  }

  // D. LOST WAGES: If Yes, need amount.
  if (fieldId === 'damages.lost_wages_details') {
    if (value.has_lost_wages === null) return false;
    if (value.has_lost_wages === true && (value.amount === null || value.amount === 0)) return false;
    return true;
  }

  // 3. Default (Primitives) -> If not null, it's done.
  return true;
};

/**
 * Scans the CaseFile to identify the next missing field based on the SOP.
 */
export const getNextMissingSlot = (caseFile: CaseFile): string | null => {
  // RULE 1: Kill Switch (Ethics)
  if (caseFile.admin.prior_representation === true) return "REJECT_PRIOR_REP";
  if (caseFile.status === "REJECTED") return "REJECTED_GENERIC";

  // RULE 2: Linear SOP Scan
  for (const step of INTAKE_STEPS) {
    const [vectorKey, fieldKey] = step.id.split('.');
    
    // Type-safe access to the nested vector
    const vector = caseFile[vectorKey as keyof CaseFile];
    
    if (vector && typeof vector === 'object') {
       // @ts-ignore: Dynamic access based on schema
       const value = vector[fieldKey];
       
       if (!isFieldComplete(step.id, value)) {
         return step.id;
       }
    }
  }

  // RULE 3: Completion
  return "COMPLETE";
};

/**
 * Returns the specific "Goal Instruction" for a given slot.
 * Updated to request Details alongside Booleans.
 */
export const getSystemInstructionForSlot = (slot: string): string => {
  switch (slot) {
    // CONTACT
    case "contact.full_name": return "Ask ONLY for the user's full legal name.";
    case "contact.email": return "Ask ONLY for the user's email address.";
    case "contact.phone_number": return "Ask ONLY for the user's phone number.";

    // ADMIN
    case "admin.prior_representation": return "Ask if the user already has an attorney. Critical stop question.";
    case "admin.conflict_party": return "Ask for the FULL NAME of the party they are suing (for conflict check).";
    
    // INCIDENT
    case "incident.accident_date": return "Ask for the date of the accident.";
    case "incident.accident_time": return "Ask for the approximate time of day.";
    case "incident.location_jurisdiction": return "Ask for the City and State where the incident occurred.";
    case "incident.weather_conditions": return "Ask about weather conditions.";
    case "incident.vehicle_description": return "Ask for details of the user's vehicle (Year, Make, Model).";
    case "incident.police_report_filed": return "Ask if a police report was filed.";
    
    // LIABILITY
    case "liability.claimant_role": return "Ask if they were driver, passenger, or pedestrian.";
    case "liability.fault_admission": return "Ask if the other driver admitted fault. IF YES: Ask exactly what they said. IF NO: Just confirm no.";
    case "liability.citation_issued": return "Ask if the other driver received a citation.";
    case "liability.witness_presence": return "Ask if there were independent witnesses.";
    
    // DAMAGES (COMPLEX)
    case "damages.injury_details": return "Ask if they were injured. IF YES: You MUST get a description of the injuries. IF NO: Confirm no injuries.";
    case "damages.medical_treatment": return "Ask if they saw a doctor or went to urgent care.";
    case "damages.hospitalization_details": return "Ask if they were hospitalized. IF YES: Ask for how long (duration).";
    case "damages.lost_wages_details": return "Ask if they lost income/wages. IF YES: Ask for the approximate amount lost.";
    
    // CLOSING
    case "admin.insurance_status": return "Ask if the other party is insured.";
    
    // TERMINAL
    case "REJECT_PRIOR_REP": return "Explain we cannot represent them (already represented). Close.";
    case "REJECTED_GENERIC": return "Politely explain we cannot proceed. Close.";
    case "COMPLETE": return "Inform user intake is complete.";
    default: return "Gather the missing information.";
  }
};
