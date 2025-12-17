
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import ChatInterface from './components/ChatInterface';
import StateVisualizer from './components/StateVisualizer';
import TranscriptModal from './components/TranscriptModal';
import { CaseFile, Message, IntakeTurnResponse, AuditResponse, LatencyMetrics, LLMProvider, LLMConfig, DEFAULT_MODELS, ApiCallLog } from './types';
import { INITIAL_CASE_FILE, SYSTEM_GREETING } from './constants';
import { processTurn, auditCaseFile, setLLMConfig, getLLMConfig, getApiCallLogs } from './services/geminiService';
import { getNextMissingSlot } from './services/stateLogic';
import { fetchModelsForProvider, ModelInfo } from './services/llmProviders';

// ENVIRONMENT CHECK
const hasApiKey = !!(process.env.GEMINI_API_KEY || process.env.API_KEY);

// ============================================================================
// LLM SETTINGS PANEL COMPONENT
// ============================================================================
interface LLMSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  config: LLMConfig;
  onSave: (config: LLMConfig) => void;
}

const LLMSettingsPanel: React.FC<LLMSettingsPanelProps> = ({ isOpen, onClose, config, onSave }) => {
  const [provider, setProvider] = useState<LLMProvider>(config.provider);
  const [apiKey, setApiKey] = useState(config.apiKey || '');
  const [localEndpoint, setLocalEndpoint] = useState(config.localEndpoint || 'http://localhost:11434');
  const [modelName, setModelName] = useState(config.modelName || '');

  // Dynamic model loading
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // Fetch models when provider, apiKey, or localEndpoint changes
  useEffect(() => {
    if (!isOpen) return;

    const loadModels = async () => {
      setIsLoadingModels(true);
      try {
        const models = await fetchModelsForProvider(provider, apiKey, localEndpoint);
        setAvailableModels(models);
        // Set default model if none selected
        if (!modelName && models.length > 0) {
          setModelName(models[0].id);
        }
      } catch (error) {
        console.error('Failed to load models:', error);
      } finally {
        setIsLoadingModels(false);
      }
    };

    loadModels();
  }, [isOpen, provider, apiKey, localEndpoint]);

  const handleSave = () => {
    const newConfig: LLMConfig = {
      provider,
      apiKey: (provider === 'openai' || provider === 'claude') ? apiKey : undefined,
      localEndpoint: provider === 'local' ? localEndpoint : undefined,
      modelName: modelName || undefined
    };
    onSave(newConfig);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-bold text-lg flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
              LLM Provider Settings
            </h2>
            <button onClick={onClose} className="text-white/80 hover:text-white">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-white/70 text-sm mt-1">Configure the fast model (Responder) provider</p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Provider Selection */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Provider</label>
            <div className="grid grid-cols-2 gap-2">
              {(['internal', 'local', 'openai', 'claude'] as LLMProvider[]).map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setProvider(p);
                    setModelName(''); // Reset model name on provider change
                  }}
                  className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${provider === p
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600'
                    }`}
                >
                  {p === 'internal' && '🔵 Gemini'}
                  {p === 'local' && '🖥️ Local (Ollama)'}
                  {p === 'openai' && '🟢 OpenAI'}
                  {p === 'claude' && '🟠 Claude'}
                </button>
              ))}
            </div>
          </div>

          {/* API Key (for OpenAI/Claude) */}
          {(provider === 'openai' || provider === 'claude') && (
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                {provider === 'openai' ? 'OpenAI API Key' : 'Anthropic API Key'}
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={provider === 'openai' ? 'sk-...' : 'sk-ant-...'}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
              />
              <p className="text-xs text-slate-500 mt-1">
                Your API key is stored locally and never sent to our servers.
              </p>
            </div>
          )}

          {/* Local Endpoint (for Ollama) */}
          {provider === 'local' && (
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Ollama Endpoint</label>
              <input
                type="text"
                value={localEndpoint}
                onChange={(e) => setLocalEndpoint(e.target.value)}
                placeholder="http://localhost:11434"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
              />
              <p className="text-xs text-slate-500 mt-1">
                Ensure Ollama is running locally with the model installed.
              </p>
            </div>
          )}

          {/* Model Selection Dropdown */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
              Model
              {isLoadingModels && (
                <span className="text-xs text-purple-500 animate-pulse">Loading...</span>
              )}
            </label>
            <select
              value={modelName || DEFAULT_MODELS[provider]}
              onChange={(e) => setModelName(e.target.value)}
              disabled={isLoadingModels}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none bg-white cursor-pointer disabled:opacity-50"
            >
              {availableModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}{model.description ? ` - ${model.description}` : ''}
                </option>
              ))}
              {availableModels.length === 0 && (
                <option value={DEFAULT_MODELS[provider]}>{DEFAULT_MODELS[provider]}</option>
              )}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              {availableModels.length > 0
                ? `${availableModels.length} models available`
                : 'Enter API key to load models'}
            </p>
          </div>

          {/* Provider Info */}
          <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600">
            {provider === 'internal' && (
              <>
                <p className="font-bold text-slate-700">🔵 Gemini (Internal)</p>
                <p>Uses the environment API_KEY. Fastest option with constrained decoding.</p>
              </>
            )}
            {provider === 'local' && (
              <>
                <p className="font-bold text-slate-700">🖥️ Local (Ollama)</p>
                <p>Runs models locally. Install Ollama and pull a model like <code>llama3.2:1b</code>.</p>
              </>
            )}
            {provider === 'openai' && (
              <>
                <p className="font-bold text-slate-700">🟢 OpenAI</p>
                <p>Uses gpt-4o-mini by default. Fast and cost-effective for chat applications.</p>
              </>
            )}
            {provider === 'claude' && (
              <>
                <p className="font-bold text-slate-700">🟠 Claude (Anthropic)</p>
                <p>Uses claude-3-haiku by default. Fast with excellent instruction following.</p>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-lg transition-colors"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

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



  // STATE: API Call Logs (with token metrics)
  const [apiCallLogs, setApiCallLogs] = useState<ApiCallLog[]>([]);

  // STATE: Supervisor Audit Metrics
  const [auditStatus, setAuditStatus] = useState<'IDLE' | 'ACTIVE'>('IDLE');
  const [auditTAT, setAuditTAT] = useState<number | null>(null);

  // STATE: LLM Settings
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [llmConfig, setLlmConfigState] = useState<LLMConfig>(getLLMConfig());

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedConfig = localStorage.getItem('llmConfig');
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig) as LLMConfig;
        setLlmConfigState(parsed);
        setLLMConfig(parsed);
      } catch (e) {
        console.error('Failed to load LLM config from localStorage', e);
      }
    }
  }, []);

  // Handle settings save
  const handleSaveSettings = (config: LLMConfig) => {
    setLlmConfigState(config);
    setLLMConfig(config);
    localStorage.setItem('llmConfig', JSON.stringify(config));
    console.log('LLM Config saved:', config);
  };

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

      setApiCallLogs(getApiCallLogs());

      // If the auditor suggests changes
      if (auditResult.corrected_data && Object.keys(auditResult.corrected_data).length > 0) {
        console.log("⚠️ Thinker applied corrections:", auditResult.corrected_data);

        setCaseFile((prev) => {
          const updated = { ...prev };
          const patches = auditResult.corrected_data;
          // Deep merge specific vectors monitored by audit
          if (patches.contact) updated.contact = { ...updated.contact, ...patches.contact };
          if (patches.incident) updated.incident = { ...updated.incident, ...patches.incident };
          if (patches.damages) updated.damages = { ...updated.damages, ...patches.damages };
          if (patches.liability) updated.liability = { ...updated.liability, ...patches.liability };
          if (patches.admin) updated.admin = { ...updated.admin, ...patches.admin };
          return updated;
        });

        // NOTE: Thinker is now "Quiet". It logs but does not interrupt.
        // If a field was invalidated (set to null), the Responder will pick it up in the next turn.
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

      setApiCallLogs(getApiCallLogs());

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

  // BLOCKER: Missing API Key (only for internal provider)
  if (!hasApiKey && llmConfig.provider === 'internal') {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-100">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">API Key Missing</h1>
          <p className="text-slate-600 mb-4">
            This POC requires a Google Gemini API Key. Please ensure <code>process.env.API_KEY</code> is set in your environment.
          </p>
          <p className="text-slate-500 text-sm mb-4">
            Alternatively, you can configure a different LLM provider.
          </p>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-bold"
          >
            Configure LLM Provider
          </button>
          <LLMSettingsPanel
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            config={llmConfig}
            onSave={handleSaveSettings}
          />
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
            apiCallLogs={apiCallLogs}
            currentProvider={llmConfig.provider}
          />

          {/* Settings Button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="absolute top-4 right-32 bg-purple-600/90 hover:bg-purple-700 text-white p-2 rounded-lg text-xs backdrop-blur-sm transition-colors flex items-center gap-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
            LLM
          </button>

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

      {/* MODAL: LLM Settings */}
      <LLMSettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={llmConfig}
        onSave={handleSaveSettings}
      />
    </div>
  );
};

export default App;
