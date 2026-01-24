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

  if (typeof msg.delta === 'string') {
    if (isAudioDeltaType(type)) return null;
    if (!isTextDeltaType(type)) return null;
    return { kind: 'delta', text: msg.delta, type };
  }
  if (typeof msg.text === 'string') return { kind: 'final', text: msg.text, type };
  if (typeof msg.transcript === 'string') return { kind: 'final', text: msg.transcript, type };

  if (msg.response && typeof msg.response === 'object') {
    if (typeof msg.response.text === 'string') return { kind: 'final', text: msg.response.text, type };
    if (typeof msg.response.transcript === 'string') return { kind: 'final', text: msg.response.transcript, type };
  }

  if (type.endsWith('.done')) {
    if (typeof msg.output_text === 'string') return { kind: 'final', text: msg.output_text, type };
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
  if (mode === 'conversation') {
    return {
      type: 'session.update',
      session: {
        voice,
        instructions:
          'You are the QuFLX AI Trading Assistant. Respond clearly and concisely for live trading. Do not mention any external platforms or providers.',
        turn_detection: { type: 'server_vad' },
        audio: {
          input: { format: { type: 'audio/pcm', rate: sampleRate } },
          output: { format: { type: 'audio/pcm', rate: sampleRate } },
        },
      },
    };
  }

  return {
    type: 'session.update',
    session: {
      voice,
      instructions:
        'You are the QuFLX dictation agent. Transcribe the user\'s speech to plain text only. Output only the transcript.',
      turn_detection: { type: 'server_vad' },
      audio: {
        input: { format: { type: 'audio/pcm', rate: sampleRate } },
        output: { format: { type: 'audio/pcm', rate: sampleRate } },
      },
    },
  };
};

const buildResponseCreate = ({ mode }) => {
  if (mode === 'conversation') {
    return {
      type: 'response.create',
      response: {
        modalities: ['text', 'audio'],
        instructions:
          'Answer the user as QuFLX. Be brief, practical, and risk-aware. If the user asks for chart-specific confirmation, ask them to use Ask AI with chart context.',
      },
    };
  }

  return {
    type: 'response.create',
    response: {
      modalities: ['text'],
      instructions: 'Return only the transcript of the last user audio. No extra words.',
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

const useVoiceAgent = ({ onError, mode = 'dictation', voice = 'Ara', sampleRate = 24000 } = {}) => {
  const wsUrl = useMemo(() => {
    const base = toWsBaseUrl(getApiBaseUrl());
    return base ? `${base}/api/v1/ai/voice/ws` : '';
  }, []);

  const shouldPlayAudio = mode === 'conversation';
  const sessionUpdateMessage = useMemo(() => buildSessionUpdate({ mode, voice, sampleRate }), [mode, voice, sampleRate]);
  const responseCreateMessage = useMemo(() => buildResponseCreate({ mode }), [mode]);

  const wsRef = useRef(null);
  const closingRef = useRef(false);
  const audioContextRef = useRef(null);
  const outputAudioContextRef = useRef(null);
  const outputTimeRef = useRef(0);
  const outputSourcesRef = useRef([]);
  const sourceRef = useRef(null);
  const processorRef = useRef(null);
  const streamRef = useRef(null);
  const textAccumulatorRef = useRef('');
  const statusRef = useRef(VoiceStatus.idle);
  const speakingRef = useRef(false);

  const [status, setStatus] = useState(VoiceStatus.idle);
  const [transcript, setTranscript] = useState('');
  const [partial, setPartial] = useState('');
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
    if (!wsUrl) {
      reportError('Voice WebSocket URL is not configured.');
      return;
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      setStatus(VoiceStatus.ready);
      return;
    }

    setStatus(VoiceStatus.connecting);
    setTranscript('');
    setPartial('');
    setLastEventType('');
    setAudioChunks(0);
    textAccumulatorRef.current = '';

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
      }

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

      if (extracted.kind === 'delta') {
        textAccumulatorRef.current += extracted.text;
        setPartial(textAccumulatorRef.current.trim());
        return;
      }

      if (extracted.kind === 'final') {
        const next = textAccumulatorRef.current ? `${textAccumulatorRef.current}${extracted.text}` : extracted.text;
        textAccumulatorRef.current = '';
        setPartial('');
        setTranscript(String(next || extracted.text).trim());
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
  }, [wsUrl, reportError, stopAudioPlayback, schedulePcm16Audio, sessionUpdateMessage, shouldPlayAudio]);

  const startRecording = useCallback(async () => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reportError('Voice is not connected.');
      return;
    }

    if (speakingRef.current) stopAudioPlayback();

    setTranscript('');
    setPartial('');
    textAccumulatorRef.current = '';

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
  }, [reportError, stopAudioPlayback]);

  const stopRecording = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
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
  }, [responseCreateMessage]);

  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  return {
    status,
    transcript,
    partial,
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
