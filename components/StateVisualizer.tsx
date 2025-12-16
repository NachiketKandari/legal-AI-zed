
import React, { useState } from 'react';
import { CaseFile } from '../types';
import { INTAKE_STEPS } from '../constants';

interface StateVisualizerProps {
  caseFile: CaseFile;
  lastThoughtTrace: string | null;
  turnAroundTime: number | null;
  auditStatus: 'IDLE' | 'ACTIVE';
  auditTAT: number | null;
}

// Helper to safely get value from nested object using string path "vector.field"
const getValue = (caseFile: CaseFile, path: string) => {
  const [vector, field] = path.split('.');
  const vectorObj = caseFile[vector as keyof CaseFile];
  if (vectorObj && typeof vectorObj === 'object') {
      // @ts-ignore
      return vectorObj[field];
  }
  return null;
};

// Formatting helper for Structs
const formatValue = (key: string, value: any): string => {
  if (value === null) return "Pending...";
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  
  // Complex Objects
  if (typeof value === 'object') {
     if (key === 'damages.injury_details') {
         if (value.has_injury === null) return "Pending...";
         if (value.has_injury === false) return "No Injuries";
         return `Yes: ${value.description || "[MISSING DESC]"}`;
     }
     if (key === 'liability.fault_admission') {
         if (value.status === null) return "Pending...";
         if (value.status !== 'Yes') return value.status;
         return `Yes: "${value.statement || "[MISSING]"}"`;
     }
     if (key === 'damages.hospitalization_details') {
         if (value.was_hospitalized === null) return "Pending...";
         if (value.was_hospitalized === false) return "No";
         return `Yes: ${value.duration || "[MISSING DURATION]"}`;
     }
     if (key === 'damages.lost_wages_details') {
         if (value.has_lost_wages === null) return "Pending...";
         if (value.has_lost_wages === false) return "No";
         return `Yes: $${value.amount || "[MISSING AMT]"}`;
     }
  }

  return String(value);
};

// Check if step is fully complete (logic mirror of stateLogic.ts)
const isComplete = (key: string, value: any): boolean => {
    if (value === null) return false;
    
    // Struct Checks: Return false if the primary discriminator is null
    if (key === 'damages.injury_details') {
        if (value.has_injury === null) return false;
        return !(value.has_injury === true && !value.description);
    }
    if (key === 'liability.fault_admission') {
        if (value.status === null) return false;
        return !(value.status === 'Yes' && !value.statement);
    }
    if (key === 'damages.hospitalization_details') {
        if (value.was_hospitalized === null) return false;
        return !(value.was_hospitalized === true && !value.duration);
    }
    if (key === 'damages.lost_wages_details') {
        if (value.has_lost_wages === null) return false;
        return !(value.has_lost_wages === true && !value.amount);
    }

    return true;
};

const StateVisualizer: React.FC<StateVisualizerProps> = ({ 
  caseFile, 
  lastThoughtTrace, 
  turnAroundTime,
  auditStatus,
  auditTAT
}) => {
  const [isMetricsOpen, setIsMetricsOpen] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  
  // LOGIC: Determine the active step
  const isCaseActive = ['QUALIFICATION', 'INTAKE'].includes(caseFile.status);
  
  // Find index of first missing slot
  let activeStepIndex = -1;
  if (isCaseActive && caseFile.admin.prior_representation !== true) {
    activeStepIndex = INTAKE_STEPS.findIndex(step => {
        const val = getValue(caseFile, step.id);
        return !isComplete(step.id, val);
    });
  }

  return (
    <div className="h-full bg-slate-100 flex flex-col border-l border-slate-300">
      {/* HEADER */}
      <div className="p-4 bg-slate-800 text-white shadow-md">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-purple-400">
            <path d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
          </svg>
          SOP Workflow Tracker
        </h2>
        <p className="text-xs text-slate-400 mt-1">Linear Procedure Enforcement</p>
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        
        {/* METRICS ROW (EXPANDABLE) */}
        <div className="mb-2 bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
            <button 
                onClick={() => setIsMetricsOpen(!isMetricsOpen)}
                className="w-full px-3 py-2 bg-slate-50 flex items-center justify-between text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
            >
                <span>Performance Metrics (Fast Model)</span>
                <svg className={`h-4 w-4 transition-transform ${isMetricsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {isMetricsOpen && (
                <div className="p-3 border-t border-slate-100 grid grid-cols-2 gap-2">
                    <div className="bg-slate-50 p-2 rounded border border-slate-100">
                        <span className="block text-[10px] text-slate-400 uppercase tracking-wide">Last Turn (TAT)</span>
                        <span className="text-sm font-mono font-bold text-slate-700">
                            {turnAroundTime !== null ? `${turnAroundTime} ms` : 'N/A'}
                        </span>
                    </div>
                     <div className="bg-slate-50 p-2 rounded border border-slate-100">
                        <span className="block text-[10px] text-slate-400 uppercase tracking-wide">Model Tier</span>
                        <span className="text-sm font-mono font-bold text-blue-600">Flash-Lite</span>
                    </div>
                </div>
            )}
        </div>

        {/* SUPERVISOR AUDIT ROW (EXPANDABLE) */}
        <div className="mb-4 bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
            <button 
                onClick={() => setIsAuditOpen(!isAuditOpen)}
                className={`w-full px-3 py-2 flex items-center justify-between text-xs font-bold hover:bg-slate-100 transition-colors ${
                  auditStatus === 'ACTIVE' ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-600'
                }`}
            >
                <div className="flex items-center gap-2">
                  <span>Supervisor Agent (Slow Model)</span>
                  {auditStatus === 'ACTIVE' && (
                    <span className="flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                    </span>
                  )}
                </div>
                <svg className={`h-4 w-4 transition-transform ${isAuditOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {isAuditOpen && (
                <div className="p-3 border-t border-slate-100 grid grid-cols-2 gap-2">
                     <div className="bg-slate-50 p-2 rounded border border-slate-100">
                        <span className="block text-[10px] text-slate-400 uppercase tracking-wide">Status</span>
                        <span className={`text-sm font-mono font-bold ${auditStatus === 'ACTIVE' ? 'text-amber-600' : 'text-slate-400'}`}>
                            {auditStatus === 'ACTIVE' ? 'THINKING...' : 'INACTIVE'}
                        </span>
                    </div>
                    <div className="bg-slate-50 p-2 rounded border border-slate-100">
                        <span className="block text-[10px] text-slate-400 uppercase tracking-wide">Audit TAT</span>
                        <span className="text-sm font-mono font-bold text-slate-700">
                            {auditTAT !== null ? `${auditTAT} ms` : '0 ms'}
                        </span>
                    </div>
                </div>
            )}
        </div>

        {/* CASE STATUS */}
        <div className="mb-4 flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-500 uppercase">Case Status</span>
          <span className={`px-2 py-1 rounded-md text-xs font-bold ${
            caseFile.status === 'INTAKE' ? 'bg-blue-100 text-blue-700' :
            caseFile.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
            caseFile.status === 'CLOSED' ? 'bg-green-100 text-green-700' :
            'bg-yellow-100 text-yellow-700'
          }`}>
            {caseFile.status}
          </span>
        </div>

        {/* WORKFLOW LIST */}
        <div className="space-y-2">
          {INTAKE_STEPS.map((step, index) => {
            const value = getValue(caseFile, step.id);
            const isCompleted = isComplete(step.id, value);
            const isActive = index === activeStepIndex;
            
            // UI State Configuration
            let containerClass = "bg-white border-slate-200";
            let icon = (
              <div className="w-5 h-5 rounded-full border-2 border-slate-300 flex items-center justify-center text-[10px] text-slate-400 font-bold">
                {index + 1}
              </div>
            );
            
            if (isCompleted) {
              containerClass = "bg-green-50 border-green-200";
              icon = (
                <div className="w-5 h-5 rounded-full bg-green-500 text-white flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                </div>
              );
            } else if (isActive) {
              containerClass = "bg-blue-50 border-blue-400 ring-1 ring-blue-400 shadow-md transform scale-[1.02] transition-all";
              icon = (
                <div className="relative w-5 h-5">
                   <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75 animate-ping"></span>
                   <div className="relative inline-flex rounded-full h-5 w-5 bg-blue-500 text-white items-center justify-center text-xs font-bold">
                    {index + 1}
                   </div>
                </div>
              );
            } else {
              containerClass = "opacity-60 bg-slate-50 border-slate-100 grayscale";
            }

            return (
              <div key={step.id} className={`flex items-center justify-between p-3 rounded-lg border ${containerClass}`}>
                <div className="flex items-center gap-3 overflow-hidden">
                  {icon}
                  <div className="flex flex-col min-w-0">
                    <span className={`text-sm font-semibold truncate ${isActive ? 'text-blue-700' : 'text-slate-700'}`}>
                      {step.label}
                    </span>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                      {step.vector}
                    </span>
                  </div>
                </div>

                <div className="max-w-[40%] text-right">
                  <span className={`text-xs font-mono break-all ${isCompleted ? 'text-slate-800 font-medium' : 'text-slate-400 italic'}`}>
                    {formatValue(step.id, value)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
};

export default StateVisualizer;
