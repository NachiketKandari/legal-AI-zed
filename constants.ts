
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



export const SYSTEM_GREETING = "Hello. I am the legal intake assistant. Before we begin discussing your case, could you please provide your Full Name?";
