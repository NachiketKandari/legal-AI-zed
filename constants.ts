
import { CaseFile } from './types';

/**
 * MOCK DATABASE for Conflict Checks.
 * In a real app, this would be an external API call.
 */
export const MOCK_CLIENT_DB = [
  'John Doe',
  'Sarah Connor',
  'Kyle Reese',
  'Cyberdyne Systems',
  'T-800'
];

/**
 * STANDARD OPERATING PROCEDURE (SOP)
 * ----------------------------------
 * Defines the strict linear order of the intake process.
 */
export const INTAKE_STEPS = [
  // 1. Basic Contact Info (Priority High)
  { id: 'contact.full_name', label: 'Full Name', vector: 'Contact' },
  { id: 'contact.email', label: 'Email Address', vector: 'Contact' },

  // 2. Gatekeeping & Ethics (Fail Fast)
  { id: 'admin.prior_representation', label: 'Prior Representation', vector: 'Administrative' },
  { id: 'admin.conflict_party', label: 'Conflict Check', vector: 'Administrative' },

  // 3. The Incident (Facts)
  { id: 'incident.accident_date', label: 'Accident Date', vector: 'Incident' },
  { id: 'incident.accident_time', label: 'Accident Time', vector: 'Incident' },
  { id: 'incident.location_jurisdiction', label: 'Location', vector: 'Incident' },
  { id: 'incident.weather_conditions', label: 'Weather Conditions', vector: 'Incident' },
  { id: 'incident.vehicle_description', label: 'Vehicle Description', vector: 'Incident' },
  { id: 'incident.police_report_filed', label: 'Police Report', vector: 'Incident' },

  // 4. Liability (Fault)
  { id: 'liability.claimant_role', label: 'Claimant Role', vector: 'Liability' },
  { id: 'liability.fault_admission', label: 'Fault Admission', vector: 'Liability' }, // STRUCT
  { id: 'liability.citation_issued', label: 'Citations Issued', vector: 'Liability' },
  { id: 'liability.witness_presence', label: 'Witnesses', vector: 'Liability' },

  // 5. Damages (Severity / Value)
  { id: 'damages.injury_details', label: 'Injuries', vector: 'Damages' }, // STRUCT
  { id: 'damages.medical_treatment', label: 'Medical Treatment', vector: 'Damages' },
  { id: 'damages.hospitalization_details', label: 'Hospitalization', vector: 'Damages' }, // STRUCT
  { id: 'damages.lost_wages_details', label: 'Lost Wages', vector: 'Damages' }, // STRUCT

  // 6. Closing
  { id: 'admin.insurance_status', label: 'Insurance Status', vector: 'Administrative' },
];

/**
 * Blank state for a new session.
 */
export const INITIAL_CASE_FILE: CaseFile = {
  case_id: `CASE-INIT`,
  status: 'QUALIFICATION',
  contact: {
    full_name: null,
    phone_number: null,
    email: null,
  },
  incident: {
    accident_date: null,
    accident_time: null,
    location_jurisdiction: null,
    police_report_filed: null,
    weather_conditions: null,
    vehicle_description: null,
  },
  liability: {
    fault_admission: { status: null, statement: null },
    citation_issued: null,
    witness_presence: null,
    claimant_role: null,
  },
  damages: {
    injury_details: { has_injury: null, description: null },
    medical_treatment: null,
    hospitalization_details: { was_hospitalized: null, duration: null },
    lost_wages_details: { has_lost_wages: null, amount: null },
  },
  admin: {
    insurance_status: null,
    prior_representation: null,
    conflict_party: null,
  }
};

export const INTAKE_QUESTION_TEMPLATES: Record<string, string> = {
  "contact.full_name": "Could you please provide your full legal name?",
  "contact.email": "What is the best email address to reach you at?",
  "contact.phone_number": "And what is your phone number?",
  "admin.prior_representation": "Do you already have an attorney representing you for this specific incident?",
  "admin.conflict_party": "For our conflict check, what is the full name of the person or entity you are seeking to hold responsible?",
  "incident.accident_date": "On what date did the accident occur?",
  "incident.accident_time": "About what time of day did it happen?",
  "incident.location_jurisdiction": "In which city and state did the incident take place?",
  "incident.weather_conditions": "What were the weather and road conditions like at the time?",
  "incident.vehicle_description": "Could you provide the year, make, and model of the vehicle you were in?",
  "incident.police_report_filed": "Was a police report filed at the scene?",
  "liability.claimant_role": "Were you the driver, a passenger, or a pedestrian in this incident?",
  "liability.fault_admission": "Did the other party admit fault or say anything about the cause of the accident?",
  "liability.citation_issued": "To your knowledge, was the other driver issued a police citation?",
  "liability.witness_presence": "Were there any independent witnesses who saw what happened?",
  "damages.injury_details": "Were you or anyone else in your vehicle injured? If so, could you briefly describe the injuries?",
  "damages.medical_treatment": "Did you receive any medical treatment or see a doctor following the accident?",
  "damages.hospitalization_details": "Were you hospitalized? If so, for how many days?",
  "damages.lost_wages_details": "Have you lost any income or wages due to being unable to work? If so, about how much?",
  "admin.insurance_status": "Lastly, do you know if the other party involved has insurance coverage?"
};

export const SYSTEM_GREETING = "Hello. I am the legal intake assistant. Before we begin discussing your case, could you please provide your Full Name?";
