import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getApiBaseUrl } from '../api/apiBase';

const toWsBaseUrl = (httpBaseUrl) => {
  const raw = String(httpBaseUrl || '').trim();
  if (!raw) return '';
  if (raw.startsWith('https://')) return `wss://${raw.slice('https://'.length)}`;
  if (raw.startsWith('http://')) return `ws://${raw.slice('http://'.length)}`;
  return raw;
};

const base64FromBytes = (bytes) => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const downsampleFloat32 = (buffer, srcRate, dstRate) => {
  if (dstRate === srcRate) return buffer;
  if (dstRate > srcRate) throw new Error('downsample dstRate must be <= srcRate');

  const ratio = srcRate / dstRate;
  const newLength = Math.floor(buffer.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.floor((offsetResult + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i += 1) {
      sum += buffer[i];
      count += 1;
    }
    result[offsetResult] = count ? sum / count : 0;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
};

const float32ToPcm16Bytes = (samples) => {
  const bytes = new Uint8Array(samples.length * 2);
  for (let i = 0; i < samples.length; i += 1) {
    let s = samples[i];
    if (s > 1) s = 1;
    if (s < -1) s = -1;
    const int16 = s < 0 ? s * 0x8000 : s * 0x7fff;
    const val = Math.round(int16);
    bytes[i * 2] = val & 0xff;
    bytes[i * 2 + 1] = (val >> 8) & 0xff;
  }
  return bytes;
};

const tryParseJson = (raw) => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const bytesFromBase64 = (b64) => {
  const binary = atob(String(b64 || ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const pcm16BytesToFloat32 = (bytes) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const samples = new Float32Array(Math.floor(bytes.byteLength / 2));
  for (let i = 0; i < samples.length; i += 1) {
    const s = view.getInt16(i * 2, true);
    samples[i] = s / 0x8000;
  }
  return samples;
};

const isAudioDeltaType = (type) => {
  const t = String(type || '').toLowerCase();
  return t.includes('audio') && !t.includes('transcript');
};

const isTextDeltaType = (type) => {
  const t = String(type || '').toLowerCase();
  return t.includes('text') || t.includes('transcript') || t.includes('output_text');
};

const extractTextDelta = (msg) => {
  if (!msg || typeof msg !== 'object') return null;
  const type = typeof msg.type === 'string' ? msg.type : '';

  // AI Response (Text/Audio Transcript)
  if (type === 'response.text.delta' && typeof msg.delta === 'string') {
    return { kind: 'ai_delta', text: msg.delta };
  }
  if (type === 'response.audio_transcript.delta' && typeof msg.delta === 'string') {
    return { kind: 'ai_delta', text: msg.delta };
  }
  if (type === 'response.text.done' && typeof msg.text === 'string') {
    return { kind: 'ai_final', text: msg.text };
  }
  if (type === 'response.audio_transcript.done' && typeof msg.transcript === 'string') {
    return { kind: 'ai_final', text: msg.transcript };
  }

  // User Transcription
  if (type === 'conversation.item.input_audio_transcription.completed' && typeof msg.transcript === 'string') {
    return { kind: 'user_final', text: msg.transcript };
  }
  // Note: xAI often sends the transcription as a 'transcript' property in other events or via item creation
  // We'll stick to specific event types to be safe.

  // Method 2: Generic Delta (Fallback) - Checks if it's NOT audio
  if (typeof msg.delta === 'string') {
    if (isAudioDeltaType(type)) return null;
    if (isTextDeltaType(type)) {
      // Heuristic: If we are in the middle of a response, it's likely AI. 
      // But safe to ignore generic deltas if we rely on specific types above.
      // actually, response.text.delta IS the generic delta for AI. 
      return null;
    }
  }

  return null;
};

const extractAudioBase64 = (msg) => {
  if (!msg || typeof msg !== 'object') return null;
  const type = typeof msg.type === 'string' ? msg.type : '';
  if (typeof msg.audio === 'string') return { audio: msg.audio, type };
  if (typeof msg.delta === 'string' && isAudioDeltaType(type)) return { audio: msg.delta, type };
  return null;
};

const buildSessionUpdate = ({ mode, voice, sampleRate }) => {
  const isConversation = mode === 'conversation' || mode === 'server'; // 'server' mode can now be conversational if configured

  if (isConversation) {
    return {
      type: 'session.update',
      session: {
        voice,
        instructions:
          'You are the QuFLX AI Trading Assistant. Respond briefly and conversationally. If the user asks for analysis, provide a concise summary. Do not use markdown formatting in speech.',
        turn_detection: { type: 'server_vad' }, // Enable VAD for natural turn-taking
        audio: {
          input: { format: { type: 'audio/pcm', rate: sampleRate } },
          output: { format: { type: 'audio/pcm', rate: sampleRate } },
        },
      },
    };
  }

  // Dictation Mode
  return {
    type: 'session.update',
    session: {
      voice,
      instructions:
        'You are a dictation engine. Transcribe the user input exactly. Do not respond. Output only the text.',
      turn_detection: { type: 'server_vad' },
      audio: {
        input: { format: { type: 'audio/pcm', rate: sampleRate } },
        output: { format: { type: 'audio/pcm', rate: sampleRate } },
      },
    },
  };
};

const buildResponseCreate = ({ mode }) => {
  // In VAD mode (server_vad), the server triggers responses automatically.
  // We only need to send response.create if we want to force a response (e.g. text input).
  // For voice-driven conversation, we generally let VAD handle it.
  // But if we do trigger it:
  if (mode === 'conversation' || mode === 'server') {
    return {
      type: 'response.create',
      response: {
        modalities: ['text', 'audio'],
        instructions: 'Respond naturally.',
      },
    };
  }
  return {
    type: 'response.create',
    response: {
      modalities: ['text'],
      instructions: 'Transcribe only.',
    },
  };
};

const VoiceStatus = {
  idle: 'idle',
  connecting: 'connecting',
  ready: 'ready',
  recording: 'recording',
  error: 'error',
};

const useVoiceAgent = ({ onError, mode = 'dictation', voice = 'Ara', sampleRate = 24000, enableAudioResponse = false } = {}) => {
  const wsUrl = useMemo(() => {
    const base = toWsBaseUrl(getApiBaseUrl());
    return base ? `${base}/api/v1/ai/voice/ws` : '';
  }, []);

  const shouldUseBrowser = mode === 'browser';
  // Enable audio playback if explicitly requested OR if we are in conversation mode
  const shouldPlayAudio = enableAudioResponse || mode === 'conversation';

  // If enableAudioResponse is true, we treat 'server' mode as 'conversation' for the session config
  const effectiveMode = enableAudioResponse && mode === 'server' ? 'conversation' : mode;

  const sessionUpdateMessage = useMemo(() => buildSessionUpdate({ mode: effectiveMode, voice, sampleRate }), [effectiveMode, voice, sampleRate]);
  const responseCreateMessage = useMemo(() => buildResponseCreate({ mode: effectiveMode }), [effectiveMode]);

  const wsRef = useRef(null);
  const closingRef = useRef(false);
  const audioContextRef = useRef(null);
  const outputAudioContextRef = useRef(null);
  const outputTimeRef = useRef(0);
  const outputSourcesRef = useRef([]);
  const sourceRef = useRef(null);
  const processorRef = useRef(null);
  const streamRef = useRef(null);

  const userTextAccumulator = useRef('');
  const aiTextAccumulator = useRef('');

  const statusRef = useRef(VoiceStatus.idle);
  const speakingRef = useRef(false);
  const recognitionRef = useRef(null);

  const [status, setStatus] = useState(VoiceStatus.idle);
  const [transcript, setTranscript] = useState(''); // User transcript
  const [aiTranscript, setAiTranscript] = useState(''); // AI Response text
  const [partial, setPartial] = useState(''); // User partial
  const [aiPartial, setAiPartial] = useState(''); // AI partial

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastEventType, setLastEventType] = useState('');
  const [audioChunks, setAudioChunks] = useState(0);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    speakingRef.current = isSpeaking;
  }, [isSpeaking]);

  const reportError = useCallback(
    (msg) => {
      if (onError) onError(String(msg || 'Voice error'));
      setStatus(VoiceStatus.error);
    },
    [onError]
  );

  const stopAudioPlayback = useCallback(() => {
    const sources = outputSourcesRef.current;
    outputSourcesRef.current = [];
    for (const source of sources) {
      try {
        source.stop();
      } catch {
        console.warn('Voice audio stop failed');
      }
    }
    outputTimeRef.current = 0;
    setIsSpeaking(false);
  }, []);

  const ensureOutputContext = useCallback(() => {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) throw new Error('AudioContext is not available.');
    let ctx = outputAudioContextRef.current;
    if (!ctx) {
      ctx = new AudioContextCtor();
      outputAudioContextRef.current = ctx;
    }
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    return ctx;
  }, []);

  const schedulePcm16Audio = useCallback(
    (b64Audio) => {
      if (!shouldPlayAudio) return;
      let ctx;
      try {
        ctx = ensureOutputContext();
      } catch (err) {
        reportError(err instanceof Error ? err.message : String(err));
        return;
      }

      let bytes;
      try {
        bytes = bytesFromBase64(b64Audio);
      } catch {
        return;
      }
      if (!bytes || bytes.byteLength < 2) return;

      const floatSamples = pcm16BytesToFloat32(bytes);
      const buffer = ctx.createBuffer(1, floatSamples.length, 24000);
      buffer.copyToChannel(floatSamples, 0);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      const now = ctx.currentTime;
      const startAt = Math.max(now + 0.03, outputTimeRef.current || now);
      outputTimeRef.current = startAt + buffer.duration;

      outputSourcesRef.current.push(source);
      setIsSpeaking(true);
      source.onended = () => {
        outputSourcesRef.current = outputSourcesRef.current.filter((s) => s !== source);
        if (outputSourcesRef.current.length === 0) {
          outputTimeRef.current = 0;
          setIsSpeaking(false);
        }
      };

      try {
        source.start(startAt);
      } catch {
        outputSourcesRef.current = outputSourcesRef.current.filter((s) => s !== source);
      }
    },
    [ensureOutputContext, reportError, shouldPlayAudio]
  );

  const disconnect = useCallback(() => {
    // 1. Clean up Browser Speech
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch { /* ignore */ }
      recognitionRef.current = null;
    }

    // 2. Clean up Server WS
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      try {
        closingRef.current = true;
        ws.close();
      } catch {
        console.warn('Voice WS close failed');
      }
    }

    const processor = processorRef.current;
    processorRef.current = null;
    if (processor) {
      try {
        processor.disconnect();
      } catch {
        console.warn('Voice processor disconnect failed');
      }
    }

    const source = sourceRef.current;
    sourceRef.current = null;
    if (source) {
      try {
        source.disconnect();
      } catch {
        console.warn('Voice source disconnect failed');
      }
    }

    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          console.warn('Voice track stop failed');
        }
      }
    }

    const ctx = audioContextRef.current;
    audioContextRef.current = null;
    if (ctx) {
      try {
        void ctx.close();
      } catch {
        console.warn('Voice AudioContext close failed');
      }
    }

    const out = outputAudioContextRef.current;
    outputAudioContextRef.current = null;
    if (out) {
      try {
        void out.close();
      } catch {
        console.warn('Voice output AudioContext close failed');
      }
    }

    outputSourcesRef.current = [];
    outputTimeRef.current = 0;
    setIsSpeaking(false);

    setStatus(VoiceStatus.idle);
  }, []);

  const connect = useCallback(async () => {
    setStatus(VoiceStatus.connecting);
    setTranscript('');
    setAiTranscript('');
    setPartial('');
    setAiPartial('');
    setLastEventType('');
    setAudioChunks(0);
    userTextAccumulator.current = '';
    aiTextAccumulator.current = '';

    // --- Browser Mode ---
    if (shouldUseBrowser) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        reportError('Browser Speech Recognition not supported.');
        return;
      }
      setStatus(VoiceStatus.ready);
      return;
    }

    // --- Server Mode ---
    if (!wsUrl) {
      reportError('Voice WebSocket URL is not configured.');
      return;
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      setStatus(VoiceStatus.ready);
      return;
    }

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      try {
        ws.send(JSON.stringify(sessionUpdateMessage));
      } catch {
        reportError('Failed to configure voice session.');
        return;
      }
      setStatus(VoiceStatus.ready);
    };

    ws.onmessage = (event) => {
      const msg = tryParseJson(event.data);
      if (!msg) return;

      if (msg && typeof msg.type === 'string') {
        setLastEventType(msg.type);
      }

      if (msg.type === 'error') {
        const detail = typeof msg.detail === 'string' ? msg.detail : 'Voice error';
        reportError(detail);
        return;
      }

      if (msg.type === 'input_audio_buffer.speech_started') {
        if (speakingRef.current) stopAudioPlayback();
        // Clear previous AI response when user starts speaking
        setAiTranscript('');
        setAiPartial('');
        aiTextAccumulator.current = '';
      }

      // Handle User finished speaking event to commit transcript?
      // xAI usually sends 'conversation.item.input_audio_transcription.completed' automatically for VAD

      if (shouldPlayAudio) {
        const audio = extractAudioBase64(msg);
        if (audio && typeof audio.audio === 'string' && audio.audio.trim()) {
          setAudioChunks((c) => c + 1);
          schedulePcm16Audio(audio.audio.trim());
        }
      }

      const extracted = extractTextDelta(msg);
      if (!extracted) return;

      const text = String(extracted.text || '').trim();
      if (!text) return;

      // Handle AI Response Text
      if (extracted.kind === 'ai_delta') {
        aiTextAccumulator.current += extracted.text;
        setAiPartial(aiTextAccumulator.current.trim());
      } else if (extracted.kind === 'ai_final') {
        const next = aiTextAccumulator.current ? `${aiTextAccumulator.current}` : extracted.text;
        // Note: 'ai_final' might allow us to just set the final text, but accumulating deltas is safer for realtime UI
        // We'll trust the accumulator + final
        setAiTranscript(next);
        setAiPartial('');
        aiTextAccumulator.current = next; // Keep it as context
      }

      // Handle User Transcription
      else if (extracted.kind === 'user_final') {
        const next = userTextAccumulator.current ? `${userTextAccumulator.current} ${extracted.text}` : extracted.text;
        userTextAccumulator.current = next;
        setTranscript(next);
        setPartial('');
      }
    };

    ws.onerror = () => {
      reportError('Voice connection error.');
    };

    ws.onclose = (e) => {
      const wasClosing = Boolean(closingRef.current);
      closingRef.current = false;
      if (wasClosing) {
        setStatus(VoiceStatus.idle);
        return;
      }

      if (statusRef.current !== VoiceStatus.error) {
        const code = e && typeof e.code === 'number' ? e.code : null;
        const reason = e && typeof e.reason === 'string' ? e.reason : '';
        const detail = `Voice disconnected${code ? ` (code=${code}${reason ? ` reason=${reason}` : ''})` : ''}.`;
        reportError(detail);
        setStatus(VoiceStatus.idle);
      }
    };
  }, [wsUrl, reportError, stopAudioPlayback, schedulePcm16Audio, sessionUpdateMessage, shouldPlayAudio, shouldUseBrowser]);

  const startRecording = useCallback(async () => {
    if (speakingRef.current) stopAudioPlayback();
    // Clear user transcript on new recording start (if desired, or keep history?)
    // Usually clear it for new turn
    setTranscript('');
    setPartial('');
    userTextAccumulator.current = '';

    // Also clear AI part? No, keep it until user speaks

    // ... rest of startRecording (same as before) ...
    // --- Browser Mode ---
    if (shouldUseBrowser) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        reportError('Browser Speech Recognition not supported.');
        return;
      }

      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.continuous = false; // Dictation usage
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setStatus(VoiceStatus.recording);
      };

      recognition.onerror = (e) => {
        reportError(`Speech error: ${e.error}`);
        setStatus(VoiceStatus.ready); // Reset to ready on error
      };

      recognition.onend = () => {
        if (statusRef.current === VoiceStatus.recording) {
          setStatus(VoiceStatus.ready);
        }
      };

      recognition.onresult = (e) => {
        let finalTrans = '';
        let interimTrans = '';
        for (let i = e.resultIndex; i < e.results.length; ++i) {
          if (e.results[i].isFinal) {
            finalTrans += e.results[i][0].transcript;
          } else {
            interimTrans += e.results[i][0].transcript;
          }
        }
        if (interimTrans) setPartial(interimTrans);
        if (finalTrans) {
          const next = `${userTextAccumulator.current} ${finalTrans}`.trim();
          userTextAccumulator.current = next;
          setTranscript(next);
          setPartial('');
        }
      };

      try {
        recognition.start();
      } catch {
        reportError('Failed to start recognition');
      }
      return;
    }

    // --- Server Mode ---
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reportError('Voice is not connected.');
      return;
    }

    // HYBRID MODE: Start Browser Recognition for Visual Feedback
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (e) => {
        let finalTrans = '';
        let interimTrans = '';
        for (let i = e.resultIndex; i < e.results.length; ++i) {
          if (e.results[i].isFinal) {
            finalTrans += e.results[i][0].transcript;
          } else {
            interimTrans += e.results[i][0].transcript;
          }
        }
        if (interimTrans) setPartial(interimTrans);
        // In Server Hybrid mode, we use browser ONLY for partials/interim. We rely on Server for final.
        // But we can fallback to it if needed. For now let's just show partials.
      };

      try {
        recognition.start();
      } catch {
        console.warn('Hybrid dictation failed to start');
      }
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      reportError('Microphone permission denied.');
      return;
    }

    streamRef.current = stream;

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      reportError('AudioContext is not available.');
      return;
    }

    const ctx = new AudioContextCtor();
    audioContextRef.current = ctx;

    const src = ctx.createMediaStreamSource(stream);
    sourceRef.current = src;

    const processor = ctx.createScriptProcessor(2048, 1, 1);
    processorRef.current = processor;

    const targetRate = 24000;
    const srcRate = ctx.sampleRate;

    processor.onaudioprocess = (e) => {
      const sock = wsRef.current;
      if (!sock || sock.readyState !== WebSocket.OPEN) return;
      const input = e.inputBuffer.getChannelData(0);
      let samples;
      try {
        samples = downsampleFloat32(input, srcRate, targetRate);
      } catch {
        return;
      }
      const bytes = float32ToPcm16Bytes(samples);
      const audio = base64FromBytes(bytes);
      try {
        sock.send(JSON.stringify({ type: 'input_audio_buffer.append', audio }));
      } catch {
        console.warn('Voice audio send failed');
      }
    };

    src.connect(processor);
    processor.connect(ctx.destination);
    setStatus(VoiceStatus.recording);
  }, [reportError, stopAudioPlayback, shouldUseBrowser]);

  const stopRecording = useCallback(() => {
    // --- Browser Mode ---
    if (shouldUseBrowser) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        // Don't null it immediately if we want to restart, but here we null it as logic is one-shot
        recognitionRef.current = null;
      }
      setStatus(VoiceStatus.ready);
      return;
    }

    // --- Server Mode ---
    const ws = wsRef.current;

    // Stop Hybrid Dictation if active
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch { /* ignore */ }
      recognitionRef.current = null;
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
        // Only send response.create if we are managing turns manually. 
        // With VAD (Conversation), usually not needed, but safe to send to imply "end of turn"
        // ws.send(JSON.stringify(responseCreateMessage)); 
        // Actually, if we use VAD, commit logic might trigger it. 
        // But for safe measure in push-to-talk:
        ws.send(JSON.stringify(responseCreateMessage));
      } catch {
        console.warn('Voice commit/send failed');
      }
    }

    const processor = processorRef.current;
    processorRef.current = null;
    if (processor) {
      try {
        processor.disconnect();
      } catch {
        console.warn('Voice processor disconnect failed');
      }
    }

    const source = sourceRef.current;
    sourceRef.current = null;
    if (source) {
      try {
        source.disconnect();
      } catch {
        console.warn('Voice source disconnect failed');
      }
    }

    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          console.warn('Voice track stop failed');
        }
      }
    }

    const ctx = audioContextRef.current;
    audioContextRef.current = null;
    if (ctx) {
      try {
        void ctx.close();
      } catch {
        console.warn('Voice AudioContext close failed');
      }
    }

    setStatus(VoiceStatus.ready);
  }, [responseCreateMessage, shouldUseBrowser]);


  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  return {
    status,
    transcript, // User Transcript
    aiTranscript, // AI Response (Final)
    partial, // User Partial
    aiPartial, // AI Partial
    connect,
    disconnect,
    startRecording,
    stopRecording,
    stopAudioPlayback,
    isConnected: status === VoiceStatus.ready || status === VoiceStatus.recording,
    isRecording: status === VoiceStatus.recording,
    isSpeaking,
    lastEventType,
    audioChunks,
  };
};

export default useVoiceAgent;
