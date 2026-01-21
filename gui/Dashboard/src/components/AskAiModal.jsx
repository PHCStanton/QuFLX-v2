import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useMarketStore from '../store/marketStore';
import useSettingsStore from '../store/settingsStore';
import { getAiImageSourceLabel } from '../utils/aiContext';

const PRESETS = [
  {
    id: 'market_overview',
    title: 'Market Overview',
    description: 'Quick regime + volatility snapshot',
    promptTemplate: ({ asset, timeframe }) => `Give a concise market overview for ${asset} on ${timeframe}. Trend, volatility, and any red flags.`
  },
  {
    id: 'chart_overview',
    title: 'Chart Overview',
    description: 'What stands out on the chart right now',
    promptTemplate: ({ asset, timeframe }) => `Summarize what stands out on the ${asset} ${timeframe} chart right now. Key levels, momentum, and likely scenarios.`
  },
  {
    id: 'alert_review',
    title: 'Alert Review',
    description: 'Sanity-check a notification/trigger',
    promptTemplate: ({ asset, timeframe }) => `Review this setup on ${asset} ${timeframe}. Rate it 1-10, biggest risk, and whether to wait or enter.`
  },
  {
    id: 'risk_check',
    title: 'Risk Check',
    description: 'Sizing and risk guardrails',
    promptTemplate: ({ asset, timeframe }) => `Given the current context on ${asset} ${timeframe}, propose a conservative risk plan and invalidation.`
  },
  {
    id: 'top_down',
    title: 'Top-Down Analysis',
    description: 'Continue in Insights Panel for depth',
    promptTemplate: ({ asset, timeframe }) => `Start a top-down analysis for ${asset}. Use HTF bias, key levels, and an entry plan for ${timeframe}.`
  },
  {
    id: 'custom',
    title: 'Custom',
    description: 'Ask anything',
    promptTemplate: () => ''
  }
];

const supportsSpeechRecognition = () => {
  if (typeof window === 'undefined') return false;
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
};

const createSpeechRecognition = () => {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  return recognition;
};

const Logo = () => (
  <svg width="24" height="24" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="askAiModalChipGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#94a3b8" />
        <stop offset="100%" stopColor="#475569" />
      </linearGradient>
    </defs>
    <rect x="32" y="4" width="6" height="10" rx="2" fill="currentColor" opacity="0.4" />
    <rect x="47" y="2" width="6" height="12" rx="2" fill="currentColor" opacity="0.6" />
    <rect x="62" y="4" width="6" height="10" rx="2" fill="currentColor" opacity="0.4" />

    <rect x="32" y="86" width="6" height="10" rx="2" fill="currentColor" opacity="0.4" />
    <rect x="47" y="86" width="6" height="12" rx="2" fill="currentColor" opacity="0.6" />
    <rect x="62" y="86" width="6" height="10" rx="2" fill="currentColor" opacity="0.4" />

    <rect x="4" y="32" width="10" height="6" rx="2" fill="currentColor" opacity="0.4" />
    <rect x="2" y="47" width="12" height="6" rx="2" fill="currentColor" opacity="0.6" />
    <rect x="4" y="62" width="10" height="6" rx="2" fill="currentColor" opacity="0.4" />

    <rect x="86" y="32" width="10" height="6" rx="2" fill="currentColor" opacity="0.4" />
    <rect x="86" y="47" width="12" height="6" rx="2" fill="currentColor" opacity="0.6" />
    <rect x="86" y="62" width="10" height="6" rx="2" fill="currentColor" opacity="0.4" />

    <rect x="12" y="12" width="76" height="76" rx="10" fill="url(#askAiModalChipGradient)" stroke="currentColor" strokeWidth="1.5" />
    <rect x="20" y="20" width="60" height="60" rx="6" fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.2" />

    <text
      x="50"
      y="52"
      fontFamily="system-ui, sans-serif"
      fontSize="50"
      fontWeight="900"
      fill="#ffffff"
      textAnchor="middle"
      dominantBaseline="central"
      style={{ letterSpacing: '-0.02em' }}
    >
      AI
    </text>
  </svg>
);

const OptionCard = ({ title, description, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`text-left rounded-xl border p-4 transition-colors bg-[#0f1419] ${active ? 'border-purple-500/70 ring-1 ring-purple-500/40' : 'border-gray-800 hover:border-gray-700'}`}
  >
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-semibold text-white">{title}</div>
        <div className="text-xs text-gray-400 mt-1">{description}</div>
      </div>
      <div className={`w-5 h-5 rounded-full flex items-center justify-center border ${active ? 'border-purple-400 bg-purple-500/20 text-purple-300' : 'border-gray-700 text-gray-600'}`}>
        <span className="text-[12px]">✓</span>
      </div>
    </div>
  </button>
);

const AskAiModal = ({
  isOpen,
  onClose,
  onAsk,
  asset,
  timeframe,
  forceImageDataUrl,
}) => {
  const { settings } = useSettingsStore();
  const {
    setActiveTab,
    aiDraftPrompt,
    setAiDraftPrompt,
    appendAiMessage,
    lastAnnotatedScreenshotDataUrl,
  } = useMarketStore();

  const [selectedPresetId, setSelectedPresetId] = useState('market_overview');
  const [localImageSource, setLocalImageSource] = useState(settings?.ai?.imageSource || 'live');
  const [answer, setAnswer] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const recognitionRef = useRef(null);

  const imageSourceLabel = useMemo(() => {
    return getAiImageSourceLabel({
      imageSource: localImageSource,
      lastAnnotatedImage: lastAnnotatedScreenshotDataUrl,
    });
  }, [localImageSource, lastAnnotatedScreenshotDataUrl]);

  const activePreset = useMemo(() => PRESETS.find((p) => p.id === selectedPresetId) || PRESETS[0], [selectedPresetId]);

  useEffect(() => {
    if (!isOpen) return;
    setAnswer('');
    setIsThinking(false);
    setVoiceText('');
    setIsListening(false);
    setIsVoiceEnabled(false);
    setLocalImageSource(settings?.ai?.imageSource || 'live');
  }, [isOpen, settings?.ai?.imageSource]);

  const handleAsk = useCallback(async () => {
    if (!onAsk) return;
    const prompt = String(aiDraftPrompt || '').trim();
    if (!prompt) return;

    if (isThinking) return;

    try {
      setIsThinking(true);
      appendAiMessage({ role: 'user', content: prompt, meta: { asset, timeframe, imageSource: localImageSource } });
      const result = await onAsk({ prompt, imageSourceOverride: localImageSource, forceImageDataUrl });
      if (!result) return;
      setAnswer(result.answer);
      appendAiMessage({ role: 'assistant', content: result.answer, meta: { asset, timeframe, imageSource: localImageSource, provider: result.meta?.model || null } });
    } finally {
      setIsThinking(false);
    }
  }, [onAsk, aiDraftPrompt, appendAiMessage, asset, timeframe, localImageSource, forceImageDataUrl, isThinking]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        void handleAsk();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose, handleAsk]);

  useEffect(() => {
    if (!isOpen) return;

    if (!isVoiceEnabled || !supportsSpeechRecognition()) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (err) {
          console.warn('Speech recognition abort failed:', err);
        }
      }
      recognitionRef.current = null;
      setIsListening(false);
      return;
    }

    const recognition = createSpeechRecognition();
    recognitionRef.current = recognition;
    if (!recognition) {
      setIsListening(false);
      return;
    }

    recognition.onresult = (event) => {
      const parts = [];
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result && result[0] && typeof result[0].transcript === 'string') {
          parts.push(result[0].transcript);
        }
      }
      const text = parts.join(' ').trim();
      setVoiceText(text);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      const merged = `${String(aiDraftPrompt || '').trim()} ${String(voiceText || '').trim()}`.trim();
      if (merged) {
        setAiDraftPrompt(merged);
      }
      setVoiceText('');
    };

    return () => {
      try {
        recognition.abort();
      } catch (err) {
        console.warn('Speech recognition abort failed:', err);
      }
      recognitionRef.current = null;
    };
  }, [isOpen, isVoiceEnabled, aiDraftPrompt, voiceText, setAiDraftPrompt]);

  const applyPreset = (presetId) => {
    setSelectedPresetId(presetId);
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const next = preset.promptTemplate({ asset, timeframe });
    if (next) {
      setAiDraftPrompt(next);
    }
    if (presetId === 'top_down') {
      setActiveTab('ai_insights');
    }
  };

  const handleContinueInPanel = () => {
    setActiveTab('ai_insights');
    onClose();
  };

  const handleVoiceToggle = () => {
    if (!supportsSpeechRecognition()) return;
    setIsVoiceEnabled((v) => !v);
  };

  const handleVoiceListen = () => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    if (isListening) {
      try {
        recognition.stop();
      } catch (err) {
        console.warn('Speech recognition stop failed:', err);
      }
      setIsListening(false);
      return;
    }

    setVoiceText('');
    try {
      recognition.start();
      setIsListening(true);
    } catch (err) {
      console.warn('Speech recognition start failed:', err);
      setIsListening(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1a1f2e] border border-gray-800 rounded-2xl w-full max-w-3xl shadow-2xl">
        <div className="p-5 border-b border-gray-800 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0f1419] border border-gray-800 flex items-center justify-center text-gray-300">
              <Logo />
            </div>
            <div>
              <div className="text-white text-lg font-semibold">Ask AI</div>
              <div className="text-xs text-gray-400 mt-0.5">
                Quick assist now. Continue in AI Insights for deeper, multi-step analysis.
              </div>
              <div className="text-[11px] text-gray-500 mt-1">
                {asset ? asset : 'No asset'}{timeframe ? ` · ${timeframe}` : ''} · Image: {imageSourceLabel}
              </div>
              {isThinking ? (
                <div className="mt-2 inline-flex items-center gap-2 text-[11px] text-gray-400">
                  <span className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                  <span>AI is thinking…</span>
                </div>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 text-[11px] rounded bg-[#0f1419] text-gray-300 border border-gray-700 hover:bg-gray-800"
          >
            Close
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="space-y-4">
            <div>
              <div className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">Choose a quick action</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PRESETS.map((p) => (
                  <OptionCard
                    key={p.id}
                    title={p.title}
                    description={p.description}
                    active={selectedPresetId === p.id}
                    onClick={() => applyPreset(p.id)}
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-400 mb-1">Prompt</label>
                <textarea
                  value={aiDraftPrompt}
                  onChange={(e) => setAiDraftPrompt(e.target.value)}
                  rows={5}
                  className="w-full bg-[#0f1419] border border-gray-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                  placeholder={activePreset.id === 'custom' ? 'Type your question…' : 'Select an option or write a custom question…'}
                />
                <div className="text-[11px] text-gray-500 mt-1">Ctrl+Enter to ask</div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Image</label>
                  <select
                    value={localImageSource}
                    onChange={(e) => setLocalImageSource(e.target.value)}
                    className="w-full bg-[#0f1419] border border-gray-800 rounded-xl px-3 py-2 text-sm text-gray-200"
                  >
                    <option value="none">None</option>
                    <option value="live">Live Snapshot</option>
                    <option value="annotated">Latest Annotated</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">Voice</label>
                  <button
                    type="button"
                    onClick={handleVoiceToggle}
                    disabled={!supportsSpeechRecognition()}
                    className="w-full px-3 py-2 text-sm rounded-xl bg-[#0f1419] border border-gray-800 text-gray-300 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isVoiceEnabled ? 'Voice: On' : 'Voice: Off'}
                  </button>
                  <button
                    type="button"
                    onClick={handleVoiceListen}
                    disabled={!isVoiceEnabled || !supportsSpeechRecognition()}
                    className="w-full mt-2 px-3 py-2 text-sm rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-200 hover:bg-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isListening ? 'Stop Listening' : 'Start Listening'}
                  </button>
                  {voiceText ? (
                    <div className="mt-2 text-[11px] text-gray-400 bg-[#0f1419] border border-gray-800 rounded-lg px-2 py-1">
                      {voiceText}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleAsk}
                disabled={isThinking}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-blue-600 text-white font-semibold hover:from-purple-600 hover:to-blue-700"
              >
                {isThinking ? 'Thinking…' : 'Ask AI'}
              </button>
              <button
                type="button"
                onClick={handleContinueInPanel}
                className="px-4 py-2 rounded-xl bg-[#0f1419] border border-gray-800 text-gray-300 hover:bg-gray-800"
              >
                Continue in AI Insights
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Response</div>
            <div className="bg-[#0f1419] border border-gray-800 rounded-xl p-4 min-h-[260px] max-h-[420px] overflow-auto">
              {isThinking && !answer ? (
                <div className="text-sm text-gray-400 flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                  <span>Thinking…</span>
                </div>
              ) : answer ? (
                <pre className="whitespace-pre-wrap text-sm text-gray-100">{answer}</pre>
              ) : (
                <div className="text-sm text-gray-500">
                  Ask a question to see a quick response here.
                </div>
              )}
            </div>
            <div className="text-[11px] text-gray-500">
              Use AI Insights for top-down analysis, multi-step plans, and follow-ups.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AskAiModal;
