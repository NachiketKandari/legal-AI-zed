import React, { useEffect, useRef, useState } from 'react';
import { Message } from '../types';

interface ChatInterfaceProps {
  messages: Message[];
  isProcessing: boolean;
  onSendMessage: (text: string) => void;
}

/**
 * ChatInterface Component
 * -----------------------
 * Displays the conversation history and provides the input mechanism.
 * Handles auto-scrolling, voice input, and loading states.
 */
const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, isProcessing, onSendMessage }) => {
  const [inputValue, setInputValue] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Ref to hold the SpeechRecognition instance to prevent GC and manage lifecycle
  const recognitionRef = useRef<any>(null);

  // Auto-scroll to bottom when messages change
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Cleanup speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  // Auto-resize textarea when input value changes (typing or voice)
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [inputValue]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (inputValue.trim() && !isProcessing) {
      onSendMessage(inputValue);
      setInputValue('');
      setVoiceError(null); // Clear errors on successful send
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
  };

  const handleVoiceInput = () => {
    setVoiceError(null); // Clear previous errors

    // @ts-ignore: Standard Web Speech API
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceError("Voice input is not supported in this browser. Please use Chrome, Edge, or Safari.");
      return;
    }

    // Abort any active recognition before starting a new one
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceError(null);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInputValue(prev => {
        const spacer = prev.length > 0 && !prev.endsWith(' ') ? ' ' : '';
        return prev + spacer + transcript;
      });
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      textareaRef.current?.focus();
    };

    recognition.onerror = (event: any) => {
      console.warn("Speech recognition error:", event.error);
      setIsListening(false);
      recognitionRef.current = null;

      // User-friendly error mapping
      if (event.error === 'network') {
        setVoiceError("Network Error: Could not reach Google's speech servers. Please type out your response.");
      } else if (event.error === 'not-allowed' || event.error === 'permission-denied') {
        setVoiceError("Microphone blocked. Please allow microphone access in your browser address bar.");
      } else if (event.error === 'no-speech') {
        // Verify we don't show an error if it just timed out silently, or show a mild prompt
        setVoiceError("No speech detected. Please try again.");
      } else if (event.error === 'aborted') {
        // Ignore manual aborts
      } else {
        setVoiceError(`Voice Error: ${event.error}`);
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (error) {
      console.error("Failed to start speech recognition", error);
      setIsListening(false);
      setVoiceError("Failed to start microphone. Please refresh the page.");
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 border-r border-slate-200">
      {/* HEADER */}
      <div className="p-4 bg-white border-b border-slate-200 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">LegalIntake AI</h2>
        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          Online | Neuro-Symbolic Engine
        </p>
      </div>

      {/* MESSAGES LIST */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${msg.role === 'user'
                ? 'bg-blue-600 text-white rounded-br-none'
                : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none'
                }`}
            >
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}

        {/* LOADING INDICATOR */}
        {isProcessing && (
          <div className="flex justify-start">
            <div className="bg-white rounded-2xl rounded-bl-none px-4 py-3 border border-slate-200 shadow-sm">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT AREA */}
      <div className="p-4 bg-white border-t border-slate-200">

        {/* Error Banner */}
        {voiceError && (
          <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between animate-fade-in">
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="text-xs text-red-700 font-medium">{voiceError}</span>
            </div>
            <button onClick={() => setVoiceError(null)} className="text-red-400 hover:text-red-600">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="relative flex items-end gap-2">
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder={isListening ? "Listening..." : "Type your response..."}
              disabled={isProcessing}
              rows={1}
              className={`w-full pl-4 pr-12 py-3 bg-slate-100 text-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all disabled:opacity-50 resize-none custom-scrollbar ${isListening ? 'ring-2 ring-red-400 bg-red-50 placeholder-red-400' : ''}`}
              style={{ maxHeight: '150px' }}
            />
          </div>

          {/* MICROPHONE BUTTON */}
          <button
            type="button"
            onClick={handleVoiceInput}
            disabled={isProcessing || isListening}
            className={`mb-1 p-3 rounded-xl transition-all shadow-sm flex-shrink-0 ${isListening
              ? 'bg-red-500 text-white animate-pulse cursor-default'
              : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
              }`}
            title="Voice to Text"
          >
            {isListening ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
                <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h3v-2.291a6.751 6.751 0 01-6-6.709v-1.5A.75.75 0 016 10.5z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
                <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h3v-2.291a6.751 6.751 0 01-6-6.709v-1.5A.75.75 0 016 10.5z" />
              </svg>
            )}
          </button>

          {/* SEND BUTTON */}
          <button
            type="submit"
            disabled={!inputValue.trim() || isProcessing}
            className="mb-1 p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm flex-shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M3.478 2.404a.75.75 0 00-.926.941l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.404z" />
            </svg>
          </button>
        </form>
        <p className="text-[10px] text-slate-400 mt-2 text-center">
          Press <strong>Enter</strong> to send, <strong>Shift + Enter</strong> for new line
        </p>
      </div>
    </div>
  );
};

export default ChatInterface;