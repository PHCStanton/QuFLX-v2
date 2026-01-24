import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const getSpeechSupport = () => {
  if (typeof window === 'undefined') return false;
  return Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance);
};

const normalizeNumber = (value, { min, max, fallback }) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
};

const splitIntoChunks = (text, maxLen) => {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return [];

  const safeMax = Math.max(80, Math.min(400, Number(maxLen) || 220));

  const sentences = raw
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks = [];
  let current = '';

  const pushCurrent = () => {
    const c = current.trim();
    if (c) chunks.push(c);
    current = '';
  };

  const pushByLength = (s) => {
    const str = String(s || '').trim();
    if (!str) return;
    if (str.length <= safeMax) {
      chunks.push(str);
      return;
    }
    for (let i = 0; i < str.length; i += safeMax) {
      chunks.push(str.slice(i, i + safeMax));
    }
  };

  for (const sentence of sentences.length ? sentences : [raw]) {
    if (!sentence) continue;
    if (!current) {
      if (sentence.length <= safeMax) {
        current = sentence;
      } else {
        pushByLength(sentence);
      }
      continue;
    }

    const next = `${current} ${sentence}`.trim();
    if (next.length <= safeMax) {
      current = next;
    } else {
      pushCurrent();
      if (sentence.length <= safeMax) {
        current = sentence;
      } else {
        pushByLength(sentence);
      }
    }
  }

  pushCurrent();
  return chunks;
};

const useTextToSpeech = ({ onError } = {}) => {
  const supported = useMemo(() => getSpeechSupport(), []);
  const utteranceQueueRef = useRef([]);
  const activeUtteranceRef = useRef(null);

  const [voices, setVoices] = useState([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const reportError = useCallback(
    (msg) => {
      if (onError) onError(String(msg || 'Voice read-back error'));
    },
    [onError]
  );

  const readVoices = useCallback(() => {
    if (!supported) return;
    try {
      const list = window.speechSynthesis.getVoices();
      setVoices(Array.isArray(list) ? list : []);
    } catch {
      setVoices([]);
    }
  }, [supported]);

  useEffect(() => {
    if (!supported) return;
    readVoices();
    const handler = () => readVoices();
    window.speechSynthesis.onvoiceschanged = handler;
    return () => {
      try {
        window.speechSynthesis.onvoiceschanged = null;
      } catch {
        // ignore
      }
    };
  }, [supported, readVoices]);

  const stop = useCallback(() => {
    if (!supported) return;
    utteranceQueueRef.current = [];
    activeUtteranceRef.current = null;
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
    setIsSpeaking(false);
    setIsPaused(false);
  }, [supported]);

  const pause = useCallback(() => {
    if (!supported) return;
    try {
      window.speechSynthesis.pause();
      setIsPaused(true);
    } catch {
      reportError('Failed to pause voice read-back.');
    }
  }, [supported, reportError]);

  const resume = useCallback(() => {
    if (!supported) return;
    try {
      window.speechSynthesis.resume();
      setIsPaused(false);
    } catch {
      reportError('Failed to resume voice read-back.');
    }
  }, [supported, reportError]);

  const speak = useCallback(
    (text, options = {}) => {
      if (!supported) {
        reportError('Voice read-back not supported in this browser.');
        return false;
      }

      const raw = String(text || '').trim();
      if (!raw) return false;

      const maxTotalChars = 6000;
      const clipped = raw.length > maxTotalChars ? `${raw.slice(0, maxTotalChars).trim()}…` : raw;

      const rate = normalizeNumber(options.rate, { min: 0.5, max: 2, fallback: 1 });
      const pitch = normalizeNumber(options.pitch, { min: 0, max: 2, fallback: 1 });
      const voiceURI = typeof options.voiceURI === 'string' ? options.voiceURI.trim() : '';

      const chunks = splitIntoChunks(clipped, 220);
      if (!chunks.length) return false;

      stop();

      const list = voices;
      const voice = voiceURI && Array.isArray(list)
        ? list.find((v) => v && typeof v.voiceURI === 'string' && v.voiceURI === voiceURI)
        : null;

      const queue = chunks.map((chunk) => {
        const utterance = new window.SpeechSynthesisUtterance(chunk);
        utterance.rate = rate;
        utterance.pitch = pitch;
        if (voice) utterance.voice = voice;
        return utterance;
      });

      utteranceQueueRef.current = queue;
      setIsSpeaking(true);
      setIsPaused(false);

      const speakNext = () => {
        const next = utteranceQueueRef.current.shift();
        if (!next) {
          activeUtteranceRef.current = null;
          setIsSpeaking(false);
          setIsPaused(false);
          return;
        }

        activeUtteranceRef.current = next;

        next.onend = () => {
          activeUtteranceRef.current = null;
          speakNext();
        };

        next.onerror = () => {
          activeUtteranceRef.current = null;
          utteranceQueueRef.current = [];
          setIsSpeaking(false);
          setIsPaused(false);
          reportError('Voice read-back failed.');
        };

        try {
          window.speechSynthesis.speak(next);
        } catch {
          activeUtteranceRef.current = null;
          utteranceQueueRef.current = [];
          setIsSpeaking(false);
          setIsPaused(false);
          reportError('Voice read-back failed.');
        }
      };

      speakNext();
      return true;
    },
    [supported, voices, stop, reportError]
  );

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return {
    supported,
    voices,
    isSpeaking,
    isPaused,
    speak,
    stop,
    pause,
    resume,
  };
};

export default useTextToSpeech;
