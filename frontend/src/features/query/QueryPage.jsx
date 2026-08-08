import { useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  HiOutlinePaperAirplane,
  HiOutlineSparkles,
  HiOutlineTrash,
  HiOutlineLightBulb,
} from 'react-icons/hi2';

import ModeSelector from './components/ModeSelector';
import StreamingMessage from './components/StreamingMessage';
import { sendQueryStream } from './queryApi';
import { setInputText, clearMessages } from './querySlice';
import Button from '../../components/Button';
import EmptyState from '../../components/EmptyState';

const SAMPLE_PROMPTS = [
  "What are the main themes across all my ingested documents?",
  "How do my technical notes connect to my project architecture?",
  "What potential contradictions exist in my research notes?",
];

export default function QueryPage() {
  const dispatch = useDispatch();
  const {
    currentMode,
    inputText,
    messages,
    isStreaming,
    activeQuestion,
    streamingAnswer,
    streamingError,
  } = useSelector((s) => s.query);

  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingAnswer, isStreaming]);

  // Clean up streaming request on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleSubmit = (e) => {
    e?.preventDefault();
    const q = inputText.trim();
    if (!q || isStreaming) return;

    dispatch(setInputText(''));
    abortControllerRef.current = new AbortController();
    sendQueryStream(
      { question: q, mode: currentMode },
      dispatch,
      abortControllerRef.current.signal
    );
  };

  const handlePromptClick = (promptText) => {
    if (isStreaming) return;
    dispatch(setInputText(''));
    abortControllerRef.current = new AbortController();
    sendQueryStream(
      { question: promptText, mode: currentMode },
      dispatch,
      abortControllerRef.current.signal
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-65px)] bg-surface-950 overflow-hidden">
      {/* Top Header / Mode Selector Bar */}
      <header className="h-16 px-6 flex items-center justify-between border-b border-surface-500/50 glass z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-500/10 text-brand-400 flex items-center justify-center">
            <HiOutlineSparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-gray-100">AI Knowledge Assistant</h1>
            <p className="text-[11px] text-gray-400">GraphRAG reasoning over your personal Second Brain</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ModeSelector />
          {(messages.length > 0 || isStreaming) && (
            <button
              onClick={() => {
                abortControllerRef.current?.abort();
                dispatch(clearMessages());
              }}
              className="p-2 rounded-xl bg-surface-800 text-gray-400 hover:text-accent-red hover:bg-accent-red/10 transition-colors"
              title="Clear Conversation"
            >
              <HiOutlineTrash className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Main Chat Stream Container */}
      <main className="flex-1 overflow-y-auto p-6 space-y-6 max-w-4xl w-full mx-auto">
        {messages.length === 0 && !isStreaming && (
          <div className="py-12 text-center space-y-8 animate-fade-in">
            <EmptyState
              icon={HiOutlineSparkles}
              title="Ask Your Second Brain"
              description="Ask questions, explore thematic connections, or challenge assumptions in your ingested library."
            />

            {/* Quick Sample Prompts */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-3xl mx-auto pt-4">
              {SAMPLE_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => handlePromptClick(prompt)}
                  className="p-4 text-left rounded-2xl glass border border-surface-500/40 hover:border-brand-500/40 hover:bg-brand-500/5 transition-all text-xs text-gray-300 space-y-2 group"
                >
                  <div className="flex items-center gap-1.5 text-brand-400 font-medium">
                    <HiOutlineLightBulb className="w-4 h-4" /> Suggestion
                  </div>
                  <p className="group-hover:text-gray-100">{prompt}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Historical Messages Stack */}
        {messages.map((msg) => (
          <div key={msg.id} className="space-y-4 animate-fade-in">
            {/* User Question Bubble */}
            <div className="flex justify-end">
              <div className="max-w-2xl px-5 py-3 rounded-2xl bg-brand-500 text-white text-sm font-medium shadow-lg shadow-brand-500/10">
                {msg.question}
              </div>
            </div>

            {/* Assistant Response Card */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-surface-700 text-brand-400 flex items-center justify-center shrink-0 mt-1">
                <HiOutlineSparkles className="w-4 h-4" />
              </div>
              <div className="flex-1 p-5 rounded-2xl glass border border-surface-500/50 space-y-2">
                <div className="flex items-center justify-between text-[10px] text-gray-400 border-b border-surface-500/30 pb-2">
                  <span className="font-semibold uppercase tracking-wider text-brand-400">{msg.mode} Mode</span>
                  <span>{msg.timestamp}</span>
                </div>
                <StreamingMessage content={msg.answer} isStreaming={false} />
              </div>
            </div>
          </div>
        ))}

        {/* Current Active Streaming Message */}
        {isStreaming && (
          <div className="space-y-4 animate-fade-in">
            {/* User Question */}
            <div className="flex justify-end">
              <div className="max-w-2xl px-5 py-3 rounded-2xl bg-brand-500 text-white text-sm font-medium shadow-lg">
                {activeQuestion}
              </div>
            </div>

            {/* Streaming Answer */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-surface-700 text-brand-400 flex items-center justify-center shrink-0 mt-1">
                <HiOutlineSparkles className="w-4 h-4 animate-pulse" />
              </div>
              <div className="flex-1 p-5 rounded-2xl glass border border-brand-500/30 space-y-2 shadow-lg">
                <div className="flex items-center justify-between text-[10px] text-gray-400 border-b border-surface-500/30 pb-2">
                  <span className="font-semibold uppercase tracking-wider text-brand-400">{currentMode} Mode</span>
                  <span className="text-accent-amber animate-pulse">Streaming Response...</span>
                </div>
                {streamingAnswer ? (
                  <StreamingMessage content={streamingAnswer} isStreaming={true} />
                ) : (
                  <div className="flex items-center gap-2 py-4 text-xs text-gray-400">
                    <span className="w-2 h-2 rounded-full bg-brand-400 animate-ping" />
                    Searching GraphRAG communities & entities...
                  </div>
                )}
                {streamingError && (
                  <p className="text-xs text-accent-red mt-2">{streamingError}</p>
                )}
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* Input Box Footer */}
      <footer className="p-4 border-t border-surface-500/50 glass shrink-0">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex items-center gap-3">
          <input
            type="text"
            value={inputText}
            onChange={(e) => dispatch(setInputText(e.target.value))}
            placeholder={`Ask a question in ${currentMode.toUpperCase()} mode...`}
            disabled={isStreaming}
            className="flex-1 px-5 py-3.5 rounded-2xl bg-surface-900 border border-surface-500/50 text-sm text-gray-100 placeholder-gray-500 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 transition-all disabled:opacity-50"
          />
          <Button
            variant="primary"
            size="md"
            type="submit"
            icon={HiOutlinePaperAirplane}
            disabled={!inputText.trim() || isStreaming}
            loading={isStreaming}
          >
            Ask
          </Button>
        </form>
      </footer>
    </div>
  );
}

