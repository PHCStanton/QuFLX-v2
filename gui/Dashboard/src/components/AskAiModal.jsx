import { useCallback, useEffect, useMemo, useState } from 'react';
import useMarketStore from '../store/marketStore';
import useSettingsStore from '../store/settingsStore';
import { getAiImageSourceLabel, buildAiContext } from '../utils/aiContext';
import useVoiceAgent from '../hooks/useVoiceAgent';
import { AI_INTRODUCTION_TEXT } from '../utils/aiIntroduction';
import useTextToSpeech from '../utils/useTextToSpeech';
import useNaturalVoice from '../hooks/useNaturalVoice';
import NeomorphicSwitch from './NeomorphicSwitch';
import askAiSubmitSound from '../assets/Sounds/UIAlert-Positive,_high-tech.mp3';

const PRESETS = [
  {
    id: 'market_overview',
    title: 'Market Overview',
    description: 'Trend, volatility, and regime snapshot',
    promptTemplate: ({ asset, timeframe }) => `Give a concise market overview for ${asset} on ${timeframe}. Trend, volatility, and any red flags.`
  },
  {
    id: 'quick_predict',
    title: 'Quick Predict',
    description: 'Fast entry, expiry, and pending-order setup',
    promptTemplate: ({ asset, timeframe }) => `FAST PREDICT for ${asset || 'current asset'} ${timeframe || 'current timeframe'}.
Use indicator confluences from context. Require 3+ aligned signals.
Format EXACTLY:
Bias: CALL/PUT (Confidence: High/Medium/Low)
Confluences: [list 3 strongest aligned indicators]
Expiry: [15s/30s/1m/3m/5m based on ADX strength]
Invalidation: [price level or condition]`
  },
  {
    id: 'full_report',
    title: 'Full Confluence Report',
    description: 'Deep dive for Insights Panel',
    promptTemplate: ({ asset }) => `You are compiling a complete top-down report for ${asset} OTC on QuFLX v2.
Rules:
- Use ONLY provided multi-TF context (1h, 15m, 5m, 1m snapshots, current price, payout, time left).
- Structure:
  1. Higher Timeframe Bias (1h/15m/5m): trend, ADX strength, major S/R, regime (trending/ranging/choppy)
  2. Lower Timeframe Triggers (1m/current): price action, best 3 indicators + values, momentum/volatility
  3. Confluence Score (0–10): how many factors align (HTF + LTF)
  4. Final Recommendation: Direction, Expiry, Target, Invalidation
  5. Risk Summary: biggest risk + session/news note
Keep total under 180 words. Be decisive — no hedging.`
  },
  {
    id: 'blitz_15s',
    title: '15s/30s Blitz',
    description: 'Ultra-fast scalp validator',
    promptTemplate: () => `Fast 15s/30s MTF validator for Pocket Option OTC.
Rules:
- ONLY QuFLX live context.
- HTF quick bias check (15m/5m only).
- LTF trigger: strongest momentum signal right now.
- Only LONG/SHORT if very clear alignment.

Output exactly 3 lines:
HTF Quick Bias: [Up/Down/Neutral]
LTF Trigger: [one phrase]
Call/Put – Expiry 15s/30s – Confidence XX% – Target [price]`
  },
  {
    id: 'custom',
    title: 'Custom',
    description: 'Ask anything',
    promptTemplate: () => ''
  }
];

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
  const customInstructions = settings?.ai?.customInstructions;
  const useWhiteModalSurface = true;
  const {
    setActiveTab,
    aiDraftPrompt,
    setAiDraftPrompt,
    appendAiMessage,
    setError,
    lastAnnotatedScreenshotDataUrl,
    marketData,
    historyCandles,
    selectedAssetKey,
    indicatorSeries,
    activeIndicators,
  } = useMarketStore();

  const [selectedPresetId, setSelectedPresetId] = useState('market_overview');
  const [localImageSource, setLocalImageSource] = useState(settings?.ai?.imageSource || 'live');
  const [answer, setAnswer] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [transcriptDraft, setTranscriptDraft] = useState('');
  const [readAnswerAloud, setReadAnswerAloud] = useState(false);
  const [conversationMode, setConversationMode] = useState(false);

  const {
    supported: ttsSupported,
    isSpeaking: isTtsSpeaking,
    isPaused: isTtsPaused,
    speak: speakTts,
    stop: stopTts,
    pause: pauseTts,
    resume: resumeTts,
  } = useTextToSpeech({ onError: setError });

  // xAI Natural Voice TTS
  const {
    isSpeaking: isNaturalSpeaking,
    speak: speakNatural,
    stop: stopNatural,
  } = useNaturalVoice({
    onError: setError,
    voice: settings?.ai?.voiceReadBackVoice || 'Ara',
  });

  const readBackMode = settings?.ai?.voiceReadBackMode || 'browser';
  const readBackEnabled = Boolean(settings?.ai?.voiceReadBackEnabled);

  // Unified speaking state
  // Unified speaking state handled after voice agent hook

  const ttsEnabled = readBackEnabled && (readBackMode === 'server' || ttsSupported);
  const ttsOptions = useMemo(
    () => ({
      rate: settings?.ai?.voiceReadBackRate,
      pitch: settings?.ai?.voiceReadBackPitch,
      voiceURI: settings?.ai?.voiceReadBackVoiceURI || '',
    }),
    [settings?.ai?.voiceReadBackPitch, settings?.ai?.voiceReadBackRate, settings?.ai?.voiceReadBackVoiceURI]
  );

  const stopSpeaking = useCallback(() => {
    if (readBackMode === 'server') {
      stopNatural();
    } else {
      stopTts();
    }
  }, [readBackMode, stopNatural, stopTts]);

  const speakText = useCallback((text) => {
    const trimmed = String(text || '').trim();
    if (!trimmed) return;
    if (readBackMode === 'server') {
      speakNatural(trimmed);
    } else {
      speakTts(trimmed, ttsOptions);
    }
  }, [readBackMode, speakNatural, speakTts, ttsOptions]);

  const contextInstructions = useMemo(() => {
    const custom = customInstructions;
    const ctx = buildAiContext({
      autoIncludeContext: true,
      marketData,
      historyCandles,
      selectedAssetKey,
      indicatorSeries,
      activeIndicators,
      selectedAsset: asset,
      selectedTimeframe: timeframe,
    });

    const dataCtx = { ...ctx };
    delete dataCtx.asset;
    delete dataCtx.timeframe;

    let base = `You are analyzing ${asset || 'the market'} on ${timeframe || 'the chart'}.\n\n`;
    base += `Current Market Data Context:\n${JSON.stringify(dataCtx, null, 2)}\n\n`;
    base += `Respond concisely relative to the user's trading context. If the user asks for current price or indicators, refer to the data provided above. NEVER say you are using simulation data.`;

    if (custom) {
      base = `${custom}\n\n${base}`;
    }
    return base;
  }, [asset, timeframe, customInstructions, marketData, historyCandles, selectedAssetKey, indicatorSeries, activeIndicators]);

  const {
    status: voiceStatus,
    transcript,
    partial: partialTranscript,
    aiTranscript,
    aiPartial,
    connect: connectVoice,
    disconnect: disconnectVoice,
    startRecording,
    stopRecording,
    isConnected: isVoiceConnected,
    isRecording,
    isSpeaking: isVoiceAgentSpeaking,
    lastEventType,
    resetTranscript,
  } = useVoiceAgent({
    onError: setError,
    mode: conversationMode ? 'server' : (settings?.ai?.voiceInputMode || 'off'),
    enableAudioResponse: conversationMode,
    instructions: conversationMode ? contextInstructions : undefined,
    voice: settings?.ai?.voiceReadBackVoice || 'Ara'
  });

  const isSpeaking = conversationMode ? isVoiceAgentSpeaking : (readBackMode === 'server' ? isNaturalSpeaking : isTtsSpeaking);

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
    setTranscriptDraft('');
    setLocalImageSource(settings?.ai?.imageSource || 'live');
    setReadAnswerAloud(false);
  }, [isOpen, settings?.ai?.imageSource]);

  useEffect(() => {
    if (isOpen) return;
    if (isSpeaking) stopSpeaking();
  }, [isOpen, isSpeaking, stopSpeaking]);

  const handleAsk = useCallback(async () => {
    if (!onAsk) return;
    const prompt = String(aiDraftPrompt || '').trim();
    if (!prompt) return;

    // Play submit sound
    const audio = new Audio(askAiSubmitSound);
    audio.play().catch(() => { });

    if (isThinking) return;

    try {
      setIsThinking(true);
      appendAiMessage({ role: 'user', content: prompt, meta: { asset, timeframe, imageSource: localImageSource } });
      const result = await onAsk({
        prompt,
        imageSourceOverride: localImageSource,
        forceImageDataUrl,
        context: { customInstructions }
      });
      if (!result) {
        setAnswer('⚠️ System Error: The AI request timed out or failed.\n\nPlease close and reopen this "Ask AI" modal, then try again.');
        return;
      }
      setAnswer(result.answer);
      appendAiMessage({ role: 'assistant', content: result.answer, meta: { asset, timeframe, imageSource: localImageSource, provider: result.meta?.model || null } });

      if (readAnswerAloud) {
        if (!ttsEnabled) {
          setError(readBackEnabled ? 'Voice Read-Back not supported.' : 'Enable Voice Read-Back in Settings.');
        } else {
          speakText(result.answer);
        }
      }
    } finally {
      setIsThinking(false);
    }
  }, [
    onAsk,
    aiDraftPrompt,
    appendAiMessage,
    asset,
    timeframe,
    localImageSource,
    forceImageDataUrl,
    isThinking,
    readAnswerAloud,
    ttsEnabled,
    readBackEnabled,
    speakText,
    setError,
    customInstructions,
  ]);

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
    return () => disconnectVoice();
  }, [isOpen, disconnectVoice]);

  useEffect(() => {
    const text = String(transcript || '').trim();
    if (!text) return;
    setTranscriptDraft(text);
  }, [transcript]);

  useEffect(() => {
    if (!conversationMode) return;
    if (aiPartial) {
      setAnswer(aiPartial);
    } else if (aiTranscript) {
      setAnswer(aiTranscript);
      // Optional: Append to chat history automatically?
      // Let's do it to keep record, but debounce it or ensure it's final.
      // aiTranscript is final.
      appendAiMessage({ role: 'assistant', content: aiTranscript, meta: { asset, timeframe, mode: 'voice_conversation' } });

      // TURN COMPLETE -> CLEAR USER INPUT
      resetTranscript();
      setTranscriptDraft('');
    }
  }, [conversationMode, aiPartial, aiTranscript, appendAiMessage, asset, timeframe, resetTranscript]);

  const applyPreset = (presetId) => {
    setSelectedPresetId(presetId);
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const next = preset.promptTemplate({ asset, timeframe });
    setAiDraftPrompt(next);
    if (presetId === 'top_down') {
      setActiveTab('ai_insights');
    }
  };

  const handleContinueInPanel = () => {
    setActiveTab('ai_insights');
    onClose();
  };

  const handleIntroduction = () => {
    setAnswer(AI_INTRODUCTION_TEXT);
    appendAiMessage({ role: 'assistant', content: AI_INTRODUCTION_TEXT, meta: { kind: 'introduction' } });

    if (readAnswerAloud) {
      if (!ttsEnabled) {
        setError(readBackEnabled ? 'Voice Read-Back not supported.' : 'Enable Voice Read-Back in Settings.');
      } else {
        speakText(AI_INTRODUCTION_TEXT);
      }
    }
  };


  const handleInsertTranscript = () => {
    const merged = `${String(aiDraftPrompt || '').trim()} ${String(transcriptDraft || '').trim()}`.trim();
    if (!merged) return;
    setAiDraftPrompt(merged);
    setTranscriptDraft('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
      <div
        className={`border rounded-2xl w-full max-w-3xl shadow-2xl ${useWhiteModalSurface ? 'bg-white border-gray-200' : 'bg-[#1a1f2e] border-gray-800'
          }`}
      >
        <div
          className={`p-5 border-b flex items-start justify-between gap-4 ${useWhiteModalSurface ? 'border-gray-200' : 'border-gray-800'
            }`}
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0f1419] border border-gray-800 flex items-center justify-center text-gray-300">
              <Logo />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <div className={`text-lg font-semibold ${useWhiteModalSurface ? 'text-gray-900' : 'text-white'}`}>Ask AI</div>
                <button
                  type="button"
                  onClick={handleIntroduction}
                  className="px-2 py-1 text-[11px] rounded bg-[#0f1419] text-gray-300 border border-gray-700 hover:bg-gray-800"
                >
                  Introduction
                </button>
              </div>
              <div className={`text-xs mt-0.5 ${useWhiteModalSurface ? 'text-gray-600' : 'text-gray-400'}`}>
                Quick assist now. Continue in AI Insights for deeper, multi-step analysis.
              </div>
              <div className={`text-[11px] mt-1 ${useWhiteModalSurface ? 'text-gray-500' : 'text-gray-500'}`}>
                {asset ? asset : 'No asset'}{timeframe ? ` · ${timeframe}` : ''} · Image: {imageSourceLabel}
              </div>
              {isThinking ? (
                <div className={`mt-2 inline-flex items-center gap-2 text-[11px] ${useWhiteModalSurface ? 'text-gray-600' : 'text-gray-400'}`}>
                  <span className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                  <span>
                    {activePreset.id === 'custom' || String(aiDraftPrompt || '').trim().length >= 450
                      ? 'AI is thinking… (complex analysis may take longer)'
                      : 'AI is thinking…'}
                  </span>
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
              <div className={`text-xs font-semibold uppercase tracking-wider mb-2 ${useWhiteModalSurface ? 'text-gray-700' : 'text-gray-300'}`}>
                Choose a quick action
              </div>
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
                <label className={`block text-xs mb-1 ${useWhiteModalSurface ? 'text-gray-600' : 'text-gray-400'}`}>Prompt</label>
                <textarea
                  value={aiDraftPrompt}
                  onChange={(e) => setAiDraftPrompt(e.target.value)}
                  rows={5}
                  className="w-full bg-[#0f1419] border border-gray-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                  placeholder={activePreset.id === 'custom' ? 'Type your question…' : 'Select an option or write a custom question…'}
                />
                <div className={`text-[11px] mt-1 ${useWhiteModalSurface ? 'text-gray-500' : 'text-gray-500'}`}>Ctrl+Enter to ask</div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className={`block text-xs mb-1 ${useWhiteModalSurface ? 'text-gray-600' : 'text-gray-400'}`}>Image</label>
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

                {settings?.ai?.voiceInputMode !== 'off' && (
                  <div>
                    <label className={`block text-xs mb-1 ${useWhiteModalSurface ? 'text-gray-600' : 'text-gray-400'}`}>
                      Voice ({settings?.ai?.voiceInputMode === 'browser' ? 'Browser' : 'Server'})
                    </label>
                    <button
                      type="button"
                      onClick={isVoiceConnected ? disconnectVoice : connectVoice}
                      className={`w-full px-3 py-2 text-sm rounded-xl border transition-colors ${isVoiceConnected
                        ? 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700'
                        : voiceStatus === 'connecting'
                          ? 'bg-[#0f1419] text-gray-200 border-gray-800 opacity-80'
                          : 'bg-[#0f1419] text-gray-200 border-gray-800 hover:bg-gray-800'
                        }`}
                    >
                      {isVoiceConnected ? 'Voice: Connected' : voiceStatus === 'connecting' ? 'Voice: Connecting…' : 'Voice: Connect'}
                    </button>
                    <button
                      type="button"
                      onClick={isRecording ? stopRecording : startRecording}
                      disabled={!isVoiceConnected}
                      className={`w-full mt-2 px-3 py-2 text-sm rounded-xl border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isRecording
                        ? 'bg-red-600 text-white border-red-700 hover:bg-red-700'
                        : 'bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700'
                        }`}
                    >
                      {isRecording
                        ? (conversationMode ? 'Stop Conversation' : 'Stop Dictation')
                        : (conversationMode ? 'Start Conversation (Mic)' : 'Start Dictation (Mic)')}
                    </button>

                    <div className="mt-2 text-[11px] text-gray-500">
                      Status: {voiceStatus}{lastEventType ? ` · ${lastEventType}` : ''}
                    </div>
                  </div>
                )}
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
            <div className={`text-xs font-semibold uppercase tracking-wider ${useWhiteModalSurface ? 'text-gray-700' : 'text-gray-300'}`}>
              Response
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className={`flex items-center gap-2 ${!ttsEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="scale-75 origin-center">
                  <NeomorphicSwitch
                    checked={readAnswerAloud}
                    onChange={() => setReadAnswerAloud(!readAnswerAloud)}
                  />
                </div>
                <span
                  className="text-[12px] text-gray-500 font-medium cursor-pointer"
                  onClick={() => setReadAnswerAloud(!readAnswerAloud)}
                >
                  Read answer aloud
                </span>
              </div>

              {isSpeaking ? (
                <div className="flex items-center gap-2">
                  {readBackMode === 'browser' && (
                    <button
                      type="button"
                      onClick={isTtsPaused ? resumeTts : pauseTts}
                      className="px-2 py-1 text-[11px] rounded bg-[#0f1419] text-gray-300 border border-gray-700 hover:bg-gray-800"
                    >
                      {isTtsPaused ? 'Resume' : 'Pause'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={stopSpeaking}
                    className="px-2 py-1 text-[11px] rounded bg-[#0f1419] text-gray-300 border border-gray-700 hover:bg-gray-800"
                  >
                    Stop
                  </button>
                </div>
              ) : null}
            </div>

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

            {settings?.ai?.voiceInputMode !== 'off' && (
              <div className="border border-gray-800 bg-[#0f1419]/50 rounded-xl p-3 min-h-[100px] max-h-[150px] overflow-y-auto">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                    {conversationMode ? 'Realtime Conversation' : 'Dictation Space'}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] uppercase font-bold ${conversationMode ? 'text-accent-green' : 'text-gray-500'}`}>
                      {conversationMode ? 'Conversation' : 'Dictation'}
                    </span>
                    <div className="scale-75 origin-right">
                      <NeomorphicSwitch
                        checked={conversationMode}
                        onChange={() => setConversationMode(!conversationMode)}
                      />
                    </div>
                  </div>
                </div>
                {!partialTranscript && !transcriptDraft ? (
                  <div className="text-sm text-gray-600 italic">
                    Start recording to see dictation...
                  </div>
                ) : null}

                {partialTranscript ? (
                  <div className="text-sm text-gray-300 animate-pulse">
                    {partialTranscript}
                  </div>
                ) : null}

                {transcriptDraft ? (
                  <div className="mt-2">
                    <div className="text-sm text-gray-200">
                      {transcriptDraft}
                    </div>
                    <button
                      type="button"
                      onClick={handleInsertTranscript}
                      className="mt-3 px-3 py-1.5 text-xs rounded bg-purple-600 hover:bg-purple-500 text-white font-medium transition-colors"
                    >
                      Insert into Prompt
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AskAiModal;
