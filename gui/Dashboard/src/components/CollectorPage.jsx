import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getApiBaseUrl } from '../api/apiBase';

/* ── Channel Config ─────────────────────────────────────────────────── */
const CHANNELS = [
    { key: 'market_data', label: 'Market Data', color: '#22c55e', icon: '📊' },
    { key: 'system_status', label: 'System Status', color: '#3b82f6', icon: '🔧' },
    { key: 'scan_heartbeat', label: 'Heartbeat', color: '#a855f7', icon: '💓' },
    { key: 'new_alert', label: 'Alerts', color: '#ef4444', icon: '🚨' },
    { key: 'trading_signal', label: 'Signals', color: '#f59e0b', icon: '⚡' },
    { key: 'regime_update', label: 'Regime', color: '#06b6d4', icon: '🏛️' },
];

const CHANNEL_MAP = Object.fromEntries(CHANNELS.map(c => [c.key, c]));
const MAX_EVENTS = 500;

/* ── Helpers ─────────────────────────────────────────────────────────── */
function formatTime(ts) {
    try {
        const d = new Date(ts);
        return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
            + '.' + String(d.getMilliseconds()).padStart(3, '0');
    } catch {
        return '--:--:--';
    }
}

function summarize(channel, data) {
    if (!data) return '';
    if (channel === 'market_data') {
        return `${data.asset || '?'}  price=${data.close ?? data.price ?? '?'}`;
    }
    if (channel === 'system_status') {
        return `${data.service || '?'} → ${data.status || '?'}`;
    }
    if (channel === 'scan_heartbeat') {
        const assets = data.active_assets?.length ?? data.assets_count ?? '?';
        return `Assets: ${assets}  Interval: ${data.scan_interval ?? '?'}s`;
    }
    if (channel === 'new_alert') {
        return `${data.asset || '?'}  ${data.direction || ''} ${data.condition || ''}`;
    }
    if (channel === 'trading_signal') {
        return `${data.asset || '?'}  ${data.direction || ''} conf=${data.confidence ?? '?'}`;
    }
    if (channel === 'regime_update') {
        return `${data.asset || '?'}  ${data.regime || data.condition || ''}`;
    }
    return JSON.stringify(data).slice(0, 80);
}

/* ═══════════════════════════════════════════════════════════════════════
   CollectorPage Component
   ═══════════════════════════════════════════════════════════════════════ */
const CollectorPage = () => {
    /* ── State ─────────────────────────────────── */
    const [events, setEvents] = useState([]);
    const [paused, setPaused] = useState(false);
    const [activeChannels, setActiveChannels] = useState(
        () => new Set(CHANNELS.map(c => c.key))
    );
    const [expandedId, setExpandedId] = useState(null);
    const [status, setStatus] = useState(null);
    const [connected, setConnected] = useState(false);
    const [counts, setCounts] = useState({});

    const pauseBuffer = useRef([]);
    const feedRef = useRef(null);
    const idCounter = useRef(0);

    /* ── Socket.IO Connection ─────────────────── */
    useEffect(() => {
        const socket = io(getApiBaseUrl(), {
            transports: ['websocket', 'polling'],
            autoConnect: true,
        });

        socket.on('connect', () => {
            setConnected(true);
            // Join the monitor room to receive ALL market_data events globally
            socket.emit('subscribe_monitor');
        });
        socket.on('disconnect', () => setConnected(false));

        // Request backend status
        socket.emit('check_status');
        const statusInterval = setInterval(() => {
            if (socket.connected) socket.emit('check_status');
        }, 5000);

        socket.on('backend_status', (data) => setStatus(data));

        // Subscribe to all channels
        CHANNELS.forEach(({ key }) => {
            socket.on(key, (data) => {
                const entry = {
                    id: ++idCounter.current,
                    channel: key,
                    data,
                    ts: Date.now(),
                };

                setCounts(prev => ({
                    ...prev,
                    [key]: (prev[key] || 0) + 1,
                }));

                if (paused) {
                    pauseBuffer.current.push(entry);
                    return;
                }

                setEvents(prev => {
                    const next = [entry, ...prev];
                    return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next;
                });
            });
        });

        return () => {
            clearInterval(statusInterval);
            socket.disconnect();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // intentionally empty — we manage paused via ref

    /* When unpausing, flush buffer */
    useEffect(() => {
        if (!paused && pauseBuffer.current.length > 0) {
            setEvents(prev => {
                const merged = [...pauseBuffer.current.reverse(), ...prev];
                pauseBuffer.current = [];
                return merged.length > MAX_EVENTS ? merged.slice(0, MAX_EVENTS) : merged;
            });
        }
    }, [paused]);

    /* ── Derived ──────────────────────────────── */
    const filteredEvents = useMemo(
        () => events.filter(e => activeChannels.has(e.channel)),
        [events, activeChannels]
    );

    const totalCount = useMemo(
        () => Object.values(counts).reduce((a, b) => a + b, 0),
        [counts]
    );

    /* ── Handlers ─────────────────────────────── */
    const toggleChannel = useCallback((key) => {
        setActiveChannels(prev => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
        });
    }, []);

    const clearEvents = useCallback(() => {
        setEvents([]);
        setCounts({});
        pauseBuffer.current = [];
    }, []);

    /* ── Render ────────────────────────────────── */
    return (
        <div className="min-h-screen bg-dashboard-bg text-white">
            {/* ── Header ───────────────────── */}
            <div
                className="sticky top-0 z-30"
                style={{
                    background: 'linear-gradient(180deg, rgba(var(--card-bg), 0.97) 0%, rgba(var(--card-bg), 0.85) 100%)',
                    backdropFilter: 'blur(16px)',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}
            >
                <div className="max-w-[1600px] mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <a href="/" className="text-gray-400 hover:text-white transition-colors text-sm">
                                ← Dashboard
                            </a>
                            <div>
                                <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
                                    <span style={{ filter: 'drop-shadow(0 0 6px rgba(34,197,94,0.5))' }}>🛰️</span>
                                    Redis Collector Monitor
                                </h1>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Live event stream from backend Redis channels
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            {/* Connection Dot */}
                            <div className="flex items-center gap-2 text-xs">
                                <span
                                    className="w-2 h-2 rounded-full inline-block"
                                    style={{
                                        backgroundColor: connected ? '#22c55e' : '#ef4444',
                                        boxShadow: connected ? '0 0 8px #22c55e' : '0 0 8px #ef4444',
                                    }}
                                />
                                <span className={connected ? 'text-emerald-300' : 'text-red-400'}>
                                    {connected ? 'Connected' : 'Disconnected'}
                                </span>
                            </div>

                            {/* Controls */}
                            <button
                                onClick={() => setPaused(v => !v)}
                                className="px-3 py-1.5 text-xs rounded-lg font-medium transition-all"
                                style={{
                                    background: paused
                                        ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                                        : 'linear-gradient(135deg, #22c55e, #16a34a)',
                                    color: '#000',
                                    boxShadow: paused
                                        ? '0 0 12px rgba(245,158,11,0.3)'
                                        : '0 0 12px rgba(34,197,94,0.3)',
                                }}
                            >
                                {paused ? `▶ Resume (${pauseBuffer.current.length})` : '⏸ Pause'}
                            </button>

                            <button
                                onClick={clearEvents}
                                className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 transition-all"
                            >
                                Clear
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-[1600px] mx-auto px-6 py-4 space-y-4">
                {/* ── Status Cards Row ────────── */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {/* Redis */}
                    <StatusCard
                        label="Redis"
                        value={status?.redis_connected ? 'Connected' : 'Disconnected'}
                        ok={status?.redis_connected}
                        icon="🔴"
                    />
                    {/* Collector */}
                    <StatusCard
                        label="Collector"
                        value={status?.chrome_debugging_available ? 'Active' : 'Inactive'}
                        ok={status?.chrome_debugging_available}
                        icon="📡"
                    />
                    {/* Total Events */}
                    <StatusCard
                        label="Total Events"
                        value={totalCount.toLocaleString()}
                        ok={true}
                        icon="📈"
                    />
                    {/* Buffer */}
                    <StatusCard
                        label="Feed Buffer"
                        value={`${events.length} / ${MAX_EVENTS}`}
                        ok={events.length < MAX_EVENTS * 0.9}
                        icon="📦"
                    />
                </div>

                {/* ── Channel Filter Tabs ─────── */}
                <div className="flex flex-wrap gap-2">
                    {CHANNELS.map(({ key, label, color, icon }) => {
                        const active = activeChannels.has(key);
                        const count = counts[key] || 0;
                        return (
                            <button
                                key={key}
                                onClick={() => toggleChannel(key)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5"
                                style={{
                                    background: active ? `${color}20` : 'rgba(255,255,255,0.03)',
                                    border: `1px solid ${active ? color : 'rgba(255,255,255,0.08)'}`,
                                    color: active ? color : '#6b7280',
                                    boxShadow: active ? `0 0 8px ${color}20` : 'none',
                                }}
                            >
                                <span>{icon}</span>
                                {label}
                                {count > 0 && (
                                    <span
                                        className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                                        style={{
                                            background: active ? `${color}30` : 'rgba(255,255,255,0.06)',
                                            color: active ? color : '#9ca3af',
                                        }}
                                    >
                                        {count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* ── Event Feed ──────────────── */}
                <div
                    ref={feedRef}
                    className="rounded-xl overflow-hidden"
                    style={{
                        background: 'rgba(var(--card-bg), 0.6)',
                        border: '1px solid rgba(255,255,255,0.06)',
                    }}
                >
                    {/* Feed Header */}
                    <div
                        className="grid px-4 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wider"
                        style={{
                            gridTemplateColumns: '90px 120px 1fr',
                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                            background: 'rgba(0,0,0,0.2)',
                        }}
                    >
                        <span>Time</span>
                        <span>Channel</span>
                        <span>Summary</span>
                    </div>

                    {/* Feed Body */}
                    <div className="max-h-[65vh] overflow-y-auto" style={{ scrollBehavior: 'smooth' }}>
                        {filteredEvents.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-600">
                                <div className="text-3xl mb-3">🛰️</div>
                                <div className="text-sm">
                                    {connected ? 'Waiting for events…' : 'Not connected to backend'}
                                </div>
                                <div className="text-xs text-gray-700 mt-1">
                                    Events will appear here in real-time
                                </div>
                            </div>
                        ) : (
                            filteredEvents.map((evt) => {
                                const ch = CHANNEL_MAP[evt.channel];
                                const isExpanded = expandedId === evt.id;
                                return (
                                    <div key={evt.id}>
                                        <button
                                            type="button"
                                            onClick={() => setExpandedId(isExpanded ? null : evt.id)}
                                            className="w-full grid px-4 py-2 text-xs text-left transition-colors hover:bg-white/[0.03] cursor-pointer"
                                            style={{
                                                gridTemplateColumns: '90px 120px 1fr',
                                                borderBottom: '1px solid rgba(255,255,255,0.03)',
                                            }}
                                        >
                                            <span className="text-gray-500 font-mono text-[11px]">
                                                {formatTime(evt.ts)}
                                            </span>
                                            <span
                                                className="font-medium text-[11px] flex items-center gap-1"
                                                style={{ color: ch?.color || '#9ca3af' }}
                                            >
                                                <span
                                                    className="w-1.5 h-1.5 rounded-full inline-block"
                                                    style={{
                                                        backgroundColor: ch?.color,
                                                        boxShadow: `0 0 4px ${ch?.color}`,
                                                    }}
                                                />
                                                {ch?.label || evt.channel}
                                            </span>
                                            <span className="text-gray-400 truncate">
                                                {summarize(evt.channel, evt.data)}
                                            </span>
                                        </button>

                                        {/* Expanded JSON */}
                                        {isExpanded && (
                                            <div
                                                className="px-6 py-3"
                                                style={{
                                                    background: 'rgba(0,0,0,0.3)',
                                                    borderBottom: `2px solid ${ch?.color || '#333'}`,
                                                }}
                                            >
                                                <pre className="text-[11px] text-gray-300 whitespace-pre-wrap break-words font-mono leading-relaxed max-h-[300px] overflow-auto">
                                                    {JSON.stringify(evt.data, null, 2)}
                                                </pre>
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

/* ── Status Card Sub-Component ──────────────────────────────────────── */
function StatusCard({ label, value, ok, icon }) {
    return (
        <div
            className="rounded-xl p-4 flex items-center gap-3 transition-all"
            style={{
                background: 'rgba(var(--card-bg), 0.6)',
                border: `1px solid ${ok ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}`,
                boxShadow: ok ? '0 0 20px rgba(34,197,94,0.05)' : '0 0 20px rgba(239,68,68,0.05)',
            }}
        >
            <div className="text-xl">{icon}</div>
            <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</div>
                <div className={`text-sm font-semibold ${ok ? 'text-emerald-300' : 'text-red-400'}`}>
                    {value}
                </div>
            </div>
        </div>
    );
}

export default CollectorPage;
