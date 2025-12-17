/**
 * LLM Provider Abstraction Layer
 * ==============================
 * Provides a unified interface for calling different LLM providers:
 * - Internal (Gemini)
 * - Local (Ollama)
 * - OpenAI (user API key)
 * - Claude (user API key)
 */

import { LLMProvider, LLMConfig, DEFAULT_MODELS, ApiCallLog } from '../types';

// ============================================================================
// MODEL FETCHING FUNCTIONS
// ============================================================================

export interface ModelInfo {
    id: string;
    name: string;
    description?: string;
}

/**
 * Fetch available Gemini models using the internal API key
 */
export const fetchGeminiModels = async (): Promise<ModelInfo[]> => {
    try {
        const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        if (!apiKey) {
            console.warn('No Gemini API key found in GEMINI_API_KEY or API_KEY environmental variables');
            return getDefaultGeminiModels();
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (!response.ok) {
            console.warn(`Failed to fetch Gemini models: ${response.status} ${response.statusText}`);
            return getDefaultGeminiModels();
        }

        const data = await response.json();
        const models: ModelInfo[] = data.models
            ?.filter((m: any) => m.name.includes('gemini') && m.supportedGenerationMethods?.includes('generateContent'))
            ?.map((m: any) => ({
                id: m.name.replace('models/', ''),
                name: m.displayName || m.name.replace('models/', ''),
                description: (m.description?.substring(0, 100) || '') + (m.supportedGenerationMethods?.includes('reasoning') ? ' [Thinking]' : '')
            }))
            ?.slice(0, 20) || [];

        return models.length > 0 ? models : getDefaultGeminiModels();
    } catch (error) {
        console.error('Error fetching Gemini models:', error);
        return getDefaultGeminiModels();
    }
};

/**
 * Fetch available OpenAI models using user's API key
 */
export const fetchOpenAIModels = async (apiKey: string): Promise<ModelInfo[]> => {
    try {
        if (!apiKey) {
            return getDefaultOpenAIModels();
        }

        const response = await fetch('https://api.openai.com/v1/models', {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        if (!response.ok) {
            console.warn('Failed to fetch OpenAI models, using defaults');
            return getDefaultOpenAIModels();
        }

        const data = await response.json();
        const models: ModelInfo[] = data.data
            ?.filter((m: any) => m.id.includes('gpt'))
            ?.sort((a: any, b: any) => b.created - a.created)
            ?.map((m: any) => ({
                id: m.id,
                name: m.id,
                description: m.owned_by || ''
            }))
            ?.slice(0, 15) || [];

        return models.length > 0 ? models : getDefaultOpenAIModels();
    } catch (error) {
        console.error('Error fetching OpenAI models:', error);
        return getDefaultOpenAIModels();
    }
};

/**
 * Fetch available Ollama models from local instance
 */
export const fetchOllamaModels = async (endpoint: string = 'http://localhost:11434'): Promise<ModelInfo[]> => {
    try {
        const response = await fetch(`${endpoint}/api/tags`);
        if (!response.ok) {
            console.warn('Failed to fetch Ollama models, using defaults');
            return getDefaultOllamaModels();
        }

        const data = await response.json();
        const models: ModelInfo[] = data.models?.map((m: any) => ({
            id: m.name,
            name: m.name,
            description: `${(m.size / 1e9).toFixed(1)}GB`
        })) || [];

        return models.length > 0 ? models : getDefaultOllamaModels();
    } catch (error) {
        console.error('Error fetching Ollama models:', error);
        return getDefaultOllamaModels();
    }
};

/**
 * Claude doesn't have a public models list API, so we use a curated list
 */
export const fetchClaudeModels = async (): Promise<ModelInfo[]> => {
    return [
        { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', description: 'Fastest, lowest cost' },
        { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', description: 'Improved Haiku' },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Best balance' },
        { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', description: 'Most capable' },
    ];
};

// Fallback lists
const getDefaultGeminiModels = (): ModelInfo[] => [
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Fast, multimodal reasoning' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Newer generation, high performance' },
    { id: 'gemini-flash-lite-latest', name: 'Gemini Flash Lite', description: 'Fastest, lowest cost' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Previous gen, stable' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Higher quality, slower' },
];

const getDefaultOpenAIModels = (): ModelInfo[] => [
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fastest, lowest cost' },
    { id: 'gpt-4o', name: 'GPT-4o', description: 'Most capable' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Fast, high quality' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Legacy, very fast' },
];

const getDefaultOllamaModels = (): ModelInfo[] => [
    { id: 'llama3.2:1b', name: 'Llama 3.2 1B', description: 'Ultra-fast, lightweight' },
    { id: 'llama3.2:3b', name: 'Llama 3.2 3B', description: 'Good balance' },
    { id: 'mistral:7b', name: 'Mistral 7B', description: 'Fast and capable' },
];

/**
 * Fetch models for any provider
 */
export const fetchModelsForProvider = async (
    provider: LLMProvider,
    apiKey?: string,
    localEndpoint?: string
): Promise<ModelInfo[]> => {
    switch (provider) {
        case 'internal':
            return fetchGeminiModels();
        case 'openai':
            return fetchOpenAIModels(apiKey || '');
        case 'claude':
            return fetchClaudeModels();
        case 'local':
            return fetchOllamaModels(localEndpoint);
        default:
            return [];
    }
};

// ============================================================================
// TOKEN COUNTING UTILITIES
// ============================================================================

/**
 * Approximate token count using a simple heuristic.
 * For accurate counts, providers return actual token usage in responses.
 * This is a fallback for estimation.
 */
export const estimateTokenCount = (text: string): number => {
    if (!text) return 0;
    // Rough approximation: ~4 characters per token for English text
    return Math.ceil(text.length / 4);
};

// ============================================================================
// API CALL LOG BUFFER
// ============================================================================

let apiCallLogBuffer: ApiCallLog[] = [];
const MAX_API_LOG_BUFFER = 25;

export const getApiCallLogs = (): ApiCallLog[] => [...apiCallLogBuffer];
export const clearApiCallLogs = () => { apiCallLogBuffer = []; };

export const addApiCallLog = (log: ApiCallLog): void => {
    apiCallLogBuffer.push(log);
    if (apiCallLogBuffer.length > MAX_API_LOG_BUFFER) {
        apiCallLogBuffer.shift();
    }

    // Console output with clear formatting
    const divider = '='.repeat(80);
    console.log(`\n${divider}`);
    console.log(`[${log.model.toUpperCase()}] API CALL LOG - ${log.provider} (${log.modelName})`);
    console.log(divider);
    console.log(`⏱️  Time Taken: ${log.timeTakenMs}ms`);
    console.log(`📥 Input Tokens: ${log.inputTokens}`);
    console.log(`📤 Output Tokens: ${log.outputTokens}`);
    console.log(`\n📝 INPUT PROMPT:\n${log.inputPrompt.substring(0, 500)}${log.inputPrompt.length > 500 ? '...[TRUNCATED]' : ''}`);
    console.log(`\n💬 OUTPUT STRING:\n${log.outputString.substring(0, 500)}${log.outputString.length > 500 ? '...[TRUNCATED]' : ''}`);
    if (log.error) {
        console.log(`\n❌ ERROR: ${log.error}`);
    }
    console.log(divider + '\n');
};

// ============================================================================
// PROVIDER RESPONSE TYPE
// ============================================================================

export interface LLMResponse {
    text: string;
    inputTokens: number;
    outputTokens: number;
    rawResponse?: any;
}

// ============================================================================
// OLLAMA (LOCAL) PROVIDER
// ============================================================================

export const callOllama = async (
    prompt: string,
    systemInstruction: string,
    config: LLMConfig
): Promise<LLMResponse> => {
    const endpoint = config.localEndpoint || 'http://localhost:11434';
    const model = config.modelName || DEFAULT_MODELS.local;

    const response = await fetch(`${endpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            prompt: `${systemInstruction}\n\nUser: ${prompt}`,
            stream: false,
            options: {
                temperature: 0,
            }
        })
    });

    if (!response.ok) {
        throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return {
        text: data.response || '',
        inputTokens: data.prompt_eval_count || estimateTokenCount(prompt + systemInstruction),
        outputTokens: data.eval_count || estimateTokenCount(data.response || ''),
        rawResponse: data
    };
};

// ============================================================================
// OPENAI PROVIDER
// ============================================================================

export const callOpenAI = async (
    prompt: string,
    systemInstruction: string,
    config: LLMConfig,
    responseSchema?: any
): Promise<LLMResponse> => {
    if (!config.apiKey) {
        throw new Error('OpenAI API key is required');
    }

    const model = config.modelName || DEFAULT_MODELS.openai;

    const messages = [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt }
    ];

    const body: any = {
        model,
        messages,
        temperature: 0,
    };

    // If response schema provided, use JSON mode
    if (responseSchema) {
        body.response_format = { type: 'json_object' };
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`OpenAI error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();

    return {
        text: data.choices?.[0]?.message?.content || '',
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
        rawResponse: data
    };
};

// ============================================================================
// CLAUDE (ANTHROPIC) PROVIDER
// ============================================================================

export const callClaude = async (
    prompt: string,
    systemInstruction: string,
    config: LLMConfig
): Promise<LLMResponse> => {
    if (!config.apiKey) {
        throw new Error('Claude API key is required');
    }

    const model = config.modelName || DEFAULT_MODELS.claude;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model,
            max_tokens: 1024,
            system: systemInstruction,
            messages: [
                { role: 'user', content: prompt }
            ]
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Claude error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();

    return {
        text: data.content?.[0]?.text || '',
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
        rawResponse: data
    };
};

// ============================================================================
// PROVIDER FACTORY
// ============================================================================

/**
 * Get the appropriate LLM call function based on provider.
 * Note: 'internal' (Gemini) is handled directly in geminiService.ts
 */
export const getLLMCallFunction = (provider: LLMProvider) => {
    switch (provider) {
        case 'local':
            return callOllama;
        case 'openai':
            return callOpenAI;
        case 'claude':
            return callClaude;
        default:
            return null; // 'internal' handled separately
    }
};

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_LLM_CONFIG: LLMConfig = {
    provider: 'internal',
    localEndpoint: 'http://localhost:11434'
};

/**
 * Validate LLM configuration
 */
export const validateConfig = (config: LLMConfig): { valid: boolean; error?: string } => {
    switch (config.provider) {
        case 'internal':
            return { valid: true };
        case 'local':
            return { valid: true }; // Ollama availability checked at runtime
        case 'openai':
            if (!config.apiKey) {
                return { valid: false, error: 'OpenAI API key is required' };
            }
            return { valid: true };
        case 'claude':
            if (!config.apiKey) {
                return { valid: false, error: 'Claude API key is required' };
            }
            return { valid: true };
        default:
            return { valid: false, error: 'Unknown provider' };
    }
};
