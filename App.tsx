
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import ChatInterface from './components/ChatInterface';
import StateVisualizer from './components/StateVisualizer';
import TranscriptModal from './components/TranscriptModal';
import { CaseFile, Message, IntakeTurnResponse, AuditResponse, LatencyMetrics, LogEntry } from './types';
import { INITIAL_CASE_FILE, SYSTEM_GREETING } from './constants';
import { processTurn, auditCaseFile, getLogBuffer } from './services/geminiService';
import { getNextMissingSlot } from './services/stateLogic';

// ENVIRONMENT CHECK
const hasApiKey = !!process.env.API_KEY;

const App: React.FC = () => {
  // STATE: Chat History
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: SYSTEM_GREETING,
      timestamp: Date.now(),
    },
  ]);

  // STATE: The Case File (Single Source of Truth)
  const [caseFile, setCaseFile] = useState<CaseFile>(INITIAL_CASE_FILE);

  // STATE: UI & Metrics
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastThought, setLastThought] = useState<string | null>(null);
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [turnAroundTime, setTurnAroundTime] = useState<number | null>(null);
  const [turnCount, setTurnCount] = useState(0);

  // STATE: Detailed Latency Metrics
  const [latencyMetrics, setLatencyMetrics] = useState<LatencyMetrics | null>(null);

  // STATE: Log Buffer for UI Display
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // STATE: Supervisor Audit Metrics
  const [auditStatus, setAuditStatus] = useState<'IDLE' | 'ACTIVE'>('IDLE');
  const [auditTAT, setAuditTAT] = useState<number | null>(null);

  // COMPUTED: Check if workflow is finished
  const isCaseComplete = useMemo(() => {
    return getNextMissingSlot(caseFile) === "COMPLETE";
  }, [caseFile]);

  // FUNCTION: Perform Audit (Thinker)
  const performAudit = async (currentCaseFileSnapshot: CaseFile, messagesSnapshot: Message[]) => {
    console.log("🔍 Triggering Thinker (Supervisor Audit)...");
    setAuditStatus('ACTIVE');
    const startTime = performance.now();

    try {
      const historyForApi = messagesSnapshot.map(m => ({ role: m.role, content: m.content }));

      // Call the Slow/Reasoning Model (Thinker)
      const auditResult: AuditResponse = await auditCaseFile(currentCaseFileSnapshot, historyForApi);

      // Update logs from buffer
      setLogs(getLogBuffer());

      // If the auditor suggests changes
      if (auditResult.corrected_data && Object.keys(auditResult.corrected_data).length > 0) {
        console.log("⚠️ Thinker applied corrections:", auditResult.corrected_data);

        setCaseFile((prev) => {
          const updated = { ...prev };
          const patches = auditResult.corrected_data;
          // Deep merge specific vectors monitored by audit
          if (patches.incident) updated.incident = { ...updated.incident, ...patches.incident };
          if (patches.damages) updated.damages = { ...updated.damages, ...patches.damages };
          if (patches.liability) updated.liability = { ...updated.liability, ...patches.liability };
          return updated;
        });

        // CASE 1: Auto-Correction (Determinable) - Prompt for Confirmation
        if (auditResult.verification_prompt) {
          const verifyMsg: Message = {
            id: uuidv4(),
            role: 'assistant',
            content: auditResult.verification_prompt,
            timestamp: Date.now(),
            thought: `THINKER AUTO-CORRECTION: ${auditResult.audit_reasoning}`
          };
          setMessages(prev => [...prev, verifyMsg]);
        }
        // CASE 2: Invalidation (Indeterminable) - Flag Issue
        else if (auditResult.flagged_issue) {
          const correctionMsg: Message = {
            id: uuidv4(),
            role: 'assistant',
            content: `I've reviewed our notes and realized I need to be more specific. ${auditResult.flagged_issue} Could you please clarify that detail?`,
            timestamp: Date.now(),
            thought: `THINKER VALIDATION: ${auditResult.audit_reasoning}`
          };
          setMessages(prev => [...prev, correctionMsg]);
        }
      }
    } catch (e) {
      console.error("Thinker Error", e);
    } finally {
      const endTime = performance.now();
      setAuditTAT(Math.round(endTime - startTime));
      setAuditStatus('IDLE');
    }
  };

  // ACTION: Handle User Input
  const handleSendMessage = useCallback(async (text: string) => {
    const startTime = performance.now();

    // 1. Optimistic UI Update
    const userMsg: Message = {
      id: uuidv4(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsProcessing(true);

    try {
      // Capture current state for parallel execution
      const currentMessagesSnapshot = [...messages, userMsg];
      const currentCaseFileSnapshot = { ...caseFile };

      // 2. Call Responder (Fast Model) - Primary path
      const historyForApi = messages.map(m => ({ role: m.role, content: m.content }));
      const result: IntakeTurnResponse & { latencyMetrics?: LatencyMetrics } = await processTurn(historyForApi, caseFile, text);

      const endTime = performance.now();
      setTurnAroundTime(Math.round(endTime - startTime));
      setTurnCount(prev => prev + 1);

      // Store detailed latency metrics
      if (result.latencyMetrics) {
        setLatencyMetrics(result.latencyMetrics);
      }

      // Update logs from buffer
      setLogs(getLogBuffer());

      // 3. Update the Case File (Symbolic State)
      let updatedCaseFile = { ...caseFile };
      setCaseFile((prev) => {
        const updated = { ...prev };
        const data = result.extracted_data;

        // Manual Deep Merge ensures we only update fields returned by the AI
        if (data.contact) updated.contact = { ...updated.contact, ...data.contact };
        if (data.incident) updated.incident = { ...updated.incident, ...data.incident };
        if (data.liability) updated.liability = { ...updated.liability, ...data.liability };
        if (data.damages) updated.damages = { ...updated.damages, ...data.damages };
        if (data.admin) updated.admin = { ...updated.admin, ...data.admin };
        if (data.status) updated.status = data.status as any;

        updatedCaseFile = updated;
        return updated;
      });

      // 4. Update UI with AI Response
      setLastThought(result.thought_trace);

      const botMsg: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: result.response_text,
        timestamp: Date.now(),
        thought: result.thought_trace
      };
      setMessages((prev) => [...prev, botMsg]);

      // 5. Run Thinker in PARALLEL (non-blocking) for validation
      // Thinker runs on every turn now, not just every 5th turn
      performAudit(updatedCaseFile, [...currentMessagesSnapshot, botMsg]);

    } catch (error) {
      console.error("Interaction failed", error);
      const errorMsg: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: "I encountered a system error processing your request. Please try again.",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      setIsProcessing(false);
    } finally {
      setIsProcessing(false);
    }
  }, [messages, caseFile]);

  // BLOCKER: Missing API Key
  if (!hasApiKey) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-100">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">API Key Missing</h1>
          <p className="text-slate-600 mb-4">
            This POC requires a Google Gemini API Key. Please ensure <code>process.env.API_KEY</code> is set in your environment.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-slate-200 flex items-center justify-center p-4">
      <div className="w-full max-w-7xl h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row relative">

        {/* LEFT: Chat Interface */}
        <div className="w-full md:w-1/2 h-1/2 md:h-full relative">
          <ChatInterface
            messages={messages}
            isProcessing={isProcessing}
            onSendMessage={handleSendMessage}
          />

          {/* Completion Trigger */}
          {isCaseComplete && (
            <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 z-10 animate-bounce">
              <button
                onClick={() => setIsTranscriptOpen(true)}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-full shadow-lg font-bold flex items-center gap-2 transition-transform hover:scale-105"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                  <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                </svg>
                View Final Transcript
              </button>
            </div>
          )}
        </div>

        {/* RIGHT: Visualizer */}
        <div className="w-full md:w-1/2 h-1/2 md:h-full relative">
          <StateVisualizer
            caseFile={caseFile}
            lastThoughtTrace={lastThought}
            turnAroundTime={turnAroundTime}
            latencyMetrics={latencyMetrics}
            auditStatus={auditStatus}
            auditTAT={auditTAT}
            logs={logs}
          />
          <button
            onClick={() => setIsTranscriptOpen(true)}
            className="absolute top-4 right-4 bg-slate-700/80 hover:bg-slate-800 text-white p-2 rounded-lg text-xs backdrop-blur-sm transition-colors"
          >
            View Transcript
          </button>
        </div>

      </div>

      {/* MODAL: Transcript / Print */}
      <TranscriptModal
        isOpen={isTranscriptOpen}
        onClose={() => setIsTranscriptOpen(false)}
        messages={messages}
        finalCaseFile={caseFile}
      />
    </div>
  );
};

export default App;
