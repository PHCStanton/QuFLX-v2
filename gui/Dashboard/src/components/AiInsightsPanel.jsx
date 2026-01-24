import Card from './Card';
import { useEffect, useMemo, useState } from 'react';
import useMarketStore from '../store/marketStore';
import useSettingsStore from '../store/settingsStore';
import useAskAi from '../hooks/useAskAi';
import { askAI } from '../api/aiClient';
import { getAiImageSourceLabel } from '../utils/aiContext';
import useVoiceAgent from '../hooks/useVoiceAgent';
import useTextToSpeech from '../utils/useTextToSpeech';

const AiInsightsPanel = () => {
  const { settings } = useSettingsStore();
  const {
    aiMessages,
    appendAiMessage,
    clearAiMessages,
    aiDraftPrompt,
    setAiDraftPrompt,
    captureChartImage,
    lastAnnotatedScreenshotDataUrl,
    marketData,
    selectedAssetKey,
    indicatorSeries,
    activeIndicators,
    selectedAsset,
    selectedTimeframe,
    setError,
  } = useMarketStore();

  const imageSourceLabel = useMemo(() => {
    return getAiImageSourceLabel({
      imageSource: settings?.ai?.imageSource,
      lastAnnotatedImage: lastAnnotatedScreenshotDataUrl,
    });
  }, [settings?.ai?.imageSource, lastAnnotatedScreenshotDataUrl]);

  const { isAsking, ask } = useAskAi({
    askAI,
    captureImage: captureChartImage,
    lastAnnotatedImage: lastAnnotatedScreenshotDataUrl,
    imageSource: settings?.ai?.imageSource,
    autoIncludeContext: settings?.ai?.autoIncludeContext,
    responseVerbosity: settings?.ai?.responseVerbosity,
    uiMode: 'insights',
    marketData,
    selectedAssetKey,
    indicatorSeries,
    activeIndicators,
    selectedAsset,
    selectedTimeframe,
    onError: setError,
  });

  const [transcriptDraft, setTranscriptDraft] = useState('');

  const {
    supported: ttsSupported,
    isSpeaking: isTtsSpeaking,
    isPaused: isTtsPaused,
    speak: speakTts,
    stop: stopTts,
    pause: pauseTts,
    resume: resumeTts,
  } = useTextToSpeech({ onError: setError });

  const ttsEnabled = Boolean(settings?.ai?.voiceReadBackEnabled && ttsSupported);
  const ttsOptions = useMemo(
    () => ({
      rate: settings?.ai?.voiceReadBackRate,
      pitch: settings?.ai?.voiceReadBackPitch,
      voiceURI: settings?.ai?.voiceReadBackVoiceURI || '',
    }),
    [settings?.ai?.voiceReadBackPitch, settings?.ai?.voiceReadBackRate, settings?.ai?.voiceReadBackVoiceURI]
  );

  const speakMessage = (m) => {
    if (!ttsEnabled) {
      setError(ttsSupported ? 'Enable Voice Read-Back in Settings.' : 'Voice Read-Back not supported in this browser.');
      return;
    }
    const text = String(m?.content || '').trim();
    if (!text) return;
    speakTts(text, ttsOptions);
  };

  useEffect(() => {
    if (!isAsking) return;
    if (isTtsSpeaking) stopTts();
  }, [isAsking, isTtsSpeaking, stopTts]);

  const {
    status: voiceStatus,
    transcript,
    partial: partialTranscript,
    connect: connectVoice,
    disconnect: disconnectVoice,
    startRecording,
    stopRecording,
    isConnected: isVoiceConnected,
    isRecording,
  } = useVoiceAgent({ onError: setError, mode: 'dictation' });

  useEffect(() => {
    const text = String(transcript || '').trim();
    if (!text) return;
    setTranscriptDraft(text);
  }, [transcript]);

  const handleInsertTranscript = () => {
    const merged = `${String(aiDraftPrompt || '').trim()} ${String(transcriptDraft || '').trim()}`.trim();
    if (!merged) return;
    setAiDraftPrompt(merged);
    setTranscriptDraft('');
  };

  const handleSend = async () => {
    const prompt = String(aiDraftPrompt || '').trim();
    if (!prompt) return;

    appendAiMessage({ role: 'user', content: prompt, meta: { asset: selectedAsset, timeframe: selectedTimeframe } });
    setAiDraftPrompt('');

    const result = await ask({ prompt });
    if (!result) return;
    appendAiMessage({ role: 'assistant', content: result.answer, meta: { asset: selectedAsset, timeframe: selectedTimeframe, provider: result.meta?.model || null } });
  };

  return (
    <div className="col-span-3 flex flex-col gap-2 h-full min-h-0">
      <Card className="p-3 rounded-lg h-full overflow-y-auto quflx-section-light">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div>
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">AI Insights</h3>
            <div className="text-[11px] text-gray-500 mt-0.5">Image: {imageSourceLabel}</div>
          </div>
          <div className="flex items-center gap-2">
            {isTtsSpeaking ? (
              <>
                <button
                  type="button"
                  onClick={isTtsPaused ? resumeTts : pauseTts}
                  className="px-2 py-1 text-[11px] rounded bg-[#0f1419] text-gray-300 border border-gray-700 hover:bg-gray-800"
                >
                  {isTtsPaused ? 'Resume' : 'Pause'}
                </button>
                <button
                  type="button"
                  onClick={stopTts}
                  className="px-2 py-1 text-[11px] rounded bg-[#0f1419] text-gray-300 border border-gray-700 hover:bg-gray-800"
                >
                  Stop
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={clearAiMessages}
              className="px-2 py-1 text-[11px] rounded bg-[#0f1419] text-gray-300 border border-gray-700 hover:bg-gray-800"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {Array.isArray(aiMessages) && aiMessages.length ? (
            <div className="space-y-2 max-h-[55vh] overflow-auto pr-1">
              {aiMessages.map((m, idx) => (
                <div
                  key={`${m.ts || 0}-${idx}`}
                  className={`rounded-xl border px-3 py-2 ${m.role === 'assistant' ? 'bg-[#0f1419] border-gray-800' : 'bg-[#0f1419]/60 border-gray-800/80'}`}
                >
                  <div className="text-[11px] text-gray-500 mb-1">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        {m.role === 'assistant' ? 'AI' : 'You'}
                        {m.meta?.asset ? ` · ${m.meta.asset}` : ''}
                        {m.meta?.timeframe ? ` · ${m.meta.timeframe}` : ''}
                      </div>
                      {m.role === 'assistant' ? (
                        <button
                          type="button"
                          onClick={() => speakMessage(m)}
                          className={`px-2 py-0.5 text-[10px] rounded border ${
                            ttsEnabled
                              ? 'bg-[#0f1419] text-gray-300 border-gray-700 hover:bg-gray-800'
                              : 'bg-[#0f1419] text-gray-500 border-gray-800 opacity-70 cursor-not-allowed'
                          }`}
                          disabled={!ttsEnabled}
                        >
                          Speak
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <pre className="whitespace-pre-wrap text-sm text-gray-100">{String(m.content || '')}</pre>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              Ask a question to start a session. Use this panel for top-down analysis, follow-ups, and journaling-style debriefs.
            </div>
          )}

          <div className="pt-3 mt-1 border-t border-gray-800">
            <textarea
              value={aiDraftPrompt}
              onChange={(e) => setAiDraftPrompt(e.target.value)}
              rows={4}
              className="w-full bg-[#0f1419] border border-gray-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40"
              placeholder="Type a follow-up question…"
            />

            <div className="mt-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={isVoiceConnected ? disconnectVoice : connectVoice}
                  className={`px-3 py-1.5 text-[12px] rounded border ${
                    isVoiceConnected
                      ? 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700'
                      : voiceStatus === 'connecting'
                        ? 'bg-[#0f1419] text-gray-200 border-gray-800 opacity-80'
                        : 'bg-[#0f1419] text-gray-200 border-gray-800 hover:bg-gray-800'
                  }`}
                >
                  {isVoiceConnected ? 'Voice Connected' : voiceStatus === 'connecting' ? 'Connecting…' : 'Voice'}
                </button>
                <button
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={!isVoiceConnected}
                  className={`px-3 py-1.5 text-[12px] rounded border disabled:opacity-60 disabled:cursor-not-allowed ${
                    isRecording
                      ? 'bg-red-600 text-white border-red-700 hover:bg-red-700'
                      : 'bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700'
                  }`}
                >
                  {isRecording ? 'Stop' : 'Record'}
                </button>
                <div className="text-[11px] text-gray-500">{voiceStatus}</div>
              </div>

              {partialTranscript ? (
                <div className="mt-2 text-[11px] text-gray-400 bg-[#0f1419] border border-gray-800 rounded-lg px-2 py-1">
                  {partialTranscript}
                </div>
              ) : null}

              {transcriptDraft ? (
                <div className="mt-2">
                  <div className="text-[11px] text-gray-400 bg-[#0f1419] border border-gray-800 rounded-lg px-2 py-1">
                    {transcriptDraft}
                  </div>
                  <button
                    type="button"
                    onClick={handleInsertTranscript}
                    className="w-full mt-2 px-3 py-2 text-sm rounded-xl bg-[#0f1419] border border-gray-800 text-gray-300 hover:bg-gray-800"
                  >
                    Insert Transcript
                  </button>
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-between mt-2">
              <div className="text-[11px] text-gray-500">
                {captureChartImage ? 'Live capture available' : 'Live capture unavailable in panel'}
              </div>
              <button
                type="button"
                onClick={handleSend}
                disabled={isAsking}
                className="px-3 py-1.5 text-[12px] rounded bg-accent-green text-black font-semibold hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isAsking ? 'Asking…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default AiInsightsPanel;
