import React from 'react';
import { Message, CaseFile } from '../types';

interface TranscriptModalProps {
  messages: Message[];
  finalCaseFile: CaseFile;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * TranscriptModal Component
 * -------------------------
 * Displays the final summary of the intake session.
 * Allows users to inspect the JSON payload and the full conversation log.
 */
const TranscriptModal: React.FC<TranscriptModalProps> = ({ messages, finalCaseFile, isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in">
        
        {/* HEADER */}
        <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Session Transcript</h2>
            <p className="text-sm text-slate-500">Neuro-Symbolic Intake Summary • Case ID: {finalCaseFile.case_id}</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-full transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* CONTENT AREA */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          
          {/* 1. Final Payload (The Asset) */}
          <section>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Final JSON Payload</h3>
            <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
              <pre className="text-xs text-green-400 font-mono">
                {JSON.stringify(finalCaseFile, null, 2)}
              </pre>
            </div>
          </section>

          {/* 2. Conversation Log (Evidence) */}
          <section>
             <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Conversation & Reasoning Log</h3>
             <div className="space-y-6">
                {messages.map((msg) => (
                  <div key={msg.id} className="flex flex-col gap-2">
                    {/* Chat Bubble */}
                    <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                       <div className={`max-w-[85%] px-4 py-3 rounded-xl border ${
                         msg.role === 'user' 
                         ? 'bg-blue-50 border-blue-100 text-blue-900' 
                         : 'bg-white border-slate-200 text-slate-800'
                       }`}>
                         <span className="text-xs font-bold block mb-1 opacity-50 uppercase">
                           {msg.role}
                         </span>
                         {msg.content}
                       </div>
                    </div>

                    {/* Thought Trace Bubble */}
                    {msg.role === 'assistant' && msg.thought && (
                      <div className="flex justify-start">
                        <div className="max-w-[85%] bg-yellow-50 border border-yellow-200 rounded-lg p-3 ml-4">
                           <div className="flex items-center gap-2 mb-1">
                             <span className="text-[10px] font-bold text-yellow-600 uppercase tracking-wider flex items-center gap-1">
                               <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                               </svg>
                               Internal Monologue
                             </span>
                           </div>
                           <p className="text-xs text-slate-600 font-mono italic">
                             {msg.thought}
                           </p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
             </div>
          </section>

        </div>

        {/* FOOTER */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
           <button 
             onClick={() => window.print()}
             className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 font-medium text-sm flex items-center gap-2 transition-colors"
           >
             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
             </svg>
             Print / Save as PDF
           </button>
        </div>
      </div>
    </div>
  );
};

export default TranscriptModal;
