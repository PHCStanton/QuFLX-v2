/**
 * useNaturalVoice - xAI Realtime API Text-to-Speech Hook
 * 
 * Sends text to xAI realtime API and plays back the natural voice audio response.
 * This provides higher quality voice output compared to browser TTS.
 * 
 * Available voices: Ara, Eve, Leo, Orion, Nova, Sage
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getApiBaseUrl } from '../api/apiBase';

const toWsBaseUrl = (httpBaseUrl) => {
    const raw = String(httpBaseUrl || '').trim();
    if (!raw) return '';
    if (raw.startsWith('https://')) return `wss://${raw.slice('https://'.length)}`;
    if (raw.startsWith('http://')) return `ws://${raw.slice('http://'.length)}`;
    return raw;
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

const tryParseJson = (raw) => {
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
};

const isAudioDeltaType = (type) => {
    const t = String(type || '').toLowerCase();
    return t.includes('audio') && !t.includes('transcript');
};

const extractAudioBase64 = (msg) => {
    if (!msg || typeof msg !== 'object') return null;
    const type = typeof msg.type === 'string' ? msg.type : '';
    if (typeof msg.audio === 'string') return { audio: msg.audio, type };
    if (typeof msg.delta === 'string' && isAudioDeltaType(type)) return { audio: msg.delta, type };
    return null;
};

const NaturalVoiceStatus = {
    idle: 'idle',
    connecting: 'connecting',
    ready: 'ready',
    speaking: 'speaking',
    error: 'error',
};

/**
 * Hook for xAI natural voice text-to-speech
 * @param {Object} options
 * @param {Function} options.onError - Error callback
 * @param {string} options.voice - Voice name (Ara, Eve, Leo, Orion, Nova, Sage)
 * @param {number} options.sampleRate - Audio sample rate (default 24000)
 */
const useNaturalVoice = ({ onError, voice = 'Ara', sampleRate = 24000 } = {}) => {
    const wsUrl = (() => {
        const base = toWsBaseUrl(getApiBaseUrl());
        return base ? `${base}/api/v1/ai/voice/ws` : '';
    })();

    const wsRef = useRef(null);
    const closingRef = useRef(false);
    const audioContextRef = useRef(null);
    const outputTimeRef = useRef(0);
    const outputSourcesRef = useRef([]);
    const pendingTextRef = useRef(null);

    const [status, setStatus] = useState(NaturalVoiceStatus.idle);
    const [isSpeaking, setIsSpeaking] = useState(false);

    const reportError = useCallback(
        (msg) => {
            if (onError) onError(String(msg || 'Natural voice error'));
            setStatus(NaturalVoiceStatus.error);
        },
        [onError]
    );

    const stopPlayback = useCallback(() => {
        const sources = outputSourcesRef.current;
        outputSourcesRef.current = [];
        for (const source of sources) {
            try {
                source.stop();
            } catch {
                // ignore
            }
        }
        outputTimeRef.current = 0;
        setIsSpeaking(false);
        setStatus((prev) => (prev === NaturalVoiceStatus.speaking ? NaturalVoiceStatus.ready : prev));
    }, []);

    const ensureAudioContext = useCallback(() => {
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) throw new Error('AudioContext not available');
        let ctx = audioContextRef.current;
        if (!ctx) {
            ctx = new AudioContextCtor();
            audioContextRef.current = ctx;
        }
        if (ctx.state === 'suspended') {
            void ctx.resume();
        }
        return ctx;
    }, []);

    const schedulePcm16Audio = useCallback(
        (b64Audio) => {
            let ctx;
            try {
                ctx = ensureAudioContext();
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
            const buffer = ctx.createBuffer(1, floatSamples.length, sampleRate);
            buffer.copyToChannel(floatSamples, 0);

            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);

            const now = ctx.currentTime;
            const startAt = Math.max(now + 0.03, outputTimeRef.current || now);
            outputTimeRef.current = startAt + buffer.duration;

            outputSourcesRef.current.push(source);
            setIsSpeaking(true);
            setStatus(NaturalVoiceStatus.speaking);

            source.onended = () => {
                outputSourcesRef.current = outputSourcesRef.current.filter((s) => s !== source);
                if (outputSourcesRef.current.length === 0) {
                    outputTimeRef.current = 0;
                    setIsSpeaking(false);
                    setStatus(NaturalVoiceStatus.ready);
                }
            };

            try {
                source.start(startAt);
            } catch {
                outputSourcesRef.current = outputSourcesRef.current.filter((s) => s !== source);
            }
        },
        [ensureAudioContext, reportError, sampleRate]
    );

    const disconnect = useCallback(() => {
        const ws = wsRef.current;
        wsRef.current = null;
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
            try {
                closingRef.current = true;
                ws.close();
            } catch {
                // ignore
            }
        }

        const ctx = audioContextRef.current;
        audioContextRef.current = null;
        if (ctx) {
            try {
                void ctx.close();
            } catch {
                // ignore
            }
        }

        outputSourcesRef.current = [];
        outputTimeRef.current = 0;
        setIsSpeaking(false);
        setStatus(NaturalVoiceStatus.idle);
    }, []);

    const sessionUpdateMessage = useMemo(() => ({
        type: 'session.update',
        session: {
            voice,
            instructions: 'Read the provided text naturally and expressively.',
            turn_detection: null,
            audio: {
                output: { format: { type: 'audio/pcm', rate: sampleRate } },
            },
        },
    }), [voice, sampleRate]);

    useEffect(() => {
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify(sessionUpdateMessage));
            } catch (err) {
                console.warn('Failed to update natural voice session:', err);
            }
        }
    }, [sessionUpdateMessage]);

    const connect = useCallback(() => {
        return new Promise((resolve, reject) => {
            if (!wsUrl) {
                reportError('Voice WebSocket URL not configured');
                reject(new Error('No WebSocket URL'));
                return;
            }

            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                // Ensure session is updated even if already connected
                try {
                    wsRef.current.send(JSON.stringify(sessionUpdateMessage));
                } catch { }
                setStatus(NaturalVoiceStatus.ready);
                resolve();
                return;
            }

            setStatus(NaturalVoiceStatus.connecting);

            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                try {
                    ws.send(JSON.stringify(sessionUpdateMessage));
                } catch (err) {
                    reportError('Failed to configure voice session');
                    reject(err);
                    return;
                }
                setStatus(NaturalVoiceStatus.ready);
                resolve();

                // If there's pending text, speak it now
                if (pendingTextRef.current) {
                    const text = pendingTextRef.current;
                    pendingTextRef.current = null;
                    // Small delay to let session configure
                    setTimeout(() => {
                        if (ws.readyState === WebSocket.OPEN) {
                            sendSpeakRequest(ws, text);
                        }
                    }, 100);
                }
            };

            ws.onmessage = (event) => {
                const msg = tryParseJson(event.data);
                if (!msg) return;

                if (msg.type === 'error') {
                    const detail = typeof msg.detail === 'string' ? msg.detail : 'Voice error';
                    reportError(detail);
                    return;
                }

                // Extract and play audio
                const audio = extractAudioBase64(msg);
                if (audio && typeof audio.audio === 'string' && audio.audio.trim()) {
                    schedulePcm16Audio(audio.audio.trim());
                }
            };

            ws.onerror = () => {
                reportError('Voice connection error');
                reject(new Error('WebSocket error'));
            };

            ws.onclose = (e) => {
                const wasClosing = Boolean(closingRef.current);
                closingRef.current = false;
                if (wasClosing) {
                    setStatus(NaturalVoiceStatus.idle);
                    return;
                }
                if (status !== NaturalVoiceStatus.error) {
                    setStatus(NaturalVoiceStatus.idle);
                }
            };
        });
    }, [wsUrl, voice, sampleRate, reportError, schedulePcm16Audio, status]);

    const sendSpeakRequest = (ws, text) => {
        // Send conversation item with the text
        const conversationItem = {
            type: 'conversation.item.create',
            item: {
                type: 'message',
                role: 'user',
                content: [{ type: 'input_text', text }],
            },
        };
        ws.send(JSON.stringify(conversationItem));

        // Request response with audio
        const responseCreate = {
            type: 'response.create',
            response: {
                modalities: ['audio'],
                instructions: 'Read the user message aloud in a clear, natural voice. Do not add any commentary.',
            },
        };
        ws.send(JSON.stringify(responseCreate));
    };

    const speak = useCallback(
        async (text) => {
            const trimmed = String(text || '').trim();
            if (!trimmed) return;

            // Stop any current playback
            stopPlayback();

            const ws = wsRef.current;
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                // Queue the text and connect
                pendingTextRef.current = trimmed;
                try {
                    await connect();
                } catch {
                    pendingTextRef.current = null;
                }
                return;
            }

            sendSpeakRequest(ws, trimmed);
        },
        [connect, stopPlayback]
    );

    // Cleanup on unmount
    useEffect(() => {
        return () => disconnect();
    }, [disconnect]);

    return {
        status,
        isSpeaking,
        speak,
        stop: stopPlayback,
        connect,
        disconnect,
        isReady: status === NaturalVoiceStatus.ready || status === NaturalVoiceStatus.speaking,
    };
};

export default useNaturalVoice;
