import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getApiBaseUrl } from '../api/apiBase';
import { fetchDevLogsIndex, fetchDevLogTail } from '../api/devLogsClient';

/* ── Event Config ────────────────────────────────────────────────────── */
const EVENTS = [
    { key: 'new_alert', label: 'Alerts', color: '#ef4444', icon: '🚨' },
    { key: 'scan_heartbeat', label: 'Heartbeat', color: '#a855f7', icon: '💓' },
    { key: 'regime_update', label: 'Regime', color: '#06b6d4', icon: '🏛️' },
    { key: 'trading_signal', label: 'Signals', color: '#f59e0b', icon: '⚡' },
    { key: 'system_status', label: 'System', color: '#3b82f6', icon: '🔧' },
];

const EVENT_MAP = Object.fromEntries(EVENTS.map(e => [e.key, e]));
const MAX_EVENTS = 300;

const LOG_FILTERS = [
    { label: 'Scanner Pulse', value: 'Scanner Pulse' },
    { label: 'Heartbeat', value: 'Heartbeat' },
    { label: 'AI', value: 'AI' },
    { label: 'Alert dispatched', value: 'Alert dispatched' },
    { label: 'Error', value: 'error' },
    { label: 'Condition Met', value: 'Condition Met' },
    { label: 'Cooldown', value: 'Cooldown' },
];

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

function summarizeEvent(channel, data) {
    if (!data) return '';
    if (channel === 'new_alert') {
        return `${data.asset || '?'}  ${data.direction || ''} ${data.regime || ''}  conf=${data.ai_confidence ?? '?'}`;
    }
    if (channel === 'scan_heartbeat') {
        const scanned = data.assets_scanned?.length ?? '?';
        const whitelisted = data.assets_whitelisted?.length ?? '?';
        return `Active: ${scanned}  Whitelisted: ${whitelisted}  Interval: ${data.scan_interval ?? '?'}s`;
    }
    if (channel === 'regime_update') {
        return `${data.asset || '?'}  ${data.regime || data.condition || ''}`;
    }
    if (channel === 'trading_signal') {
        return `${data.asset || '?'}  ${data.direction || ''} conf=${data.confidence ?? '?'}`;
    }
    if (channel === 'system_status') {
        return `${data.service || '?'} → ${data.status || '?'}`;
    }
    return JSON.stringify(data).slice(0, 100);
}

/* ═══════════════════════════════════════════════════════════════════════
   AlertDispatchPage Component
   ═══════════════════════════════════════════════════════════════════════ */
const AlertDispatchPage = () => {
    /* ── Live Events State ───────────── */
    const [events, setEvents] = useState([]);
    const [paused, setPaused] = useState(false);
    const [activeChannels, setActiveChannels] = useState(() => new Set(EVENTS.map(e => e.key)));
    const [expandedId, setExpandedId] = useState(null);
    const [connected, setConnected] = useState(false);
    const [counts, setCounts] = useState({});
    const [heartbeat, setHeartbeat] = useState(null);

    /* ── Log File State ──────────────── */
    const [tab, setTab] = useState('live'); // 'live' | 'logs'
    const [logFiles, setLogFiles] = useState([]);
    const [selectedFile, setSelectedFile] = useState('');
    const [logContent, setLogContent] = useState([]);
    const [logFilter, setLogFilter] = useState('');
    const [logLines, setLogLines] = useState(200);
    const [logLoading, setLogLoading] = useState(false);
    const [logError, setLogError] = useState('');

    const pauseBuffer = useRef([]);
    const idCounter = useRef(0);

    /* ── Socket.IO Connection ─────────── */
    useEffect(() => {
        const socket = io(getApiBaseUrl(), {
            transports: ['websocket', 'polling'],
            autoConnect: true,
        });

        socket.on('connect', () => setConnected(true));
        socket.on('disconnect', () => setConnected(false));

        // Listen for live events
        EVENTS.forEach(({ key }) => {
            socket.on(key, (data) => {
                const entry = {
                    id: ++idCounter.current,
                    channel: key,
                    data,
                    ts: Date.now(),
                };

                setCounts(prev => ({ ...prev, [key]: (prev[key] || 0) + 1 }));

                // Track latest heartbeat
                if (key === 'scan_heartbeat') {
                    setHeartbeat({ ...data, receivedAt: Date.now() });
                }

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

        return () => socket.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* Flush buffer on unpause */
    useEffect(() => {
        if (!paused && pauseBuffer.current.length > 0) {
            setEvents(prev => {
                const merged = [...pauseBuffer.current.reverse(), ...prev];
                pauseBuffer.current = [];
                return merged.length > MAX_EVENTS ? merged.slice(0, MAX_EVENTS) : merged;
            });
        }
    }, [paused]);

    /* ── Log File Loader ──────────────── */
    useEffect(() => {
        if (tab !== 'logs') return;
        let cancelled = false;

        (async () => {
            try {
                const index = await fetchDevLogsIndex();
                const svc = index?.services?.find(s => s.name === 'alert_dispatch');
                const files = svc?.files || [];
                if (cancelled) return;
                setLogFiles(files);

                // Auto-select latest file
                if (files.length > 0 && !selectedFile) {
                    setSelectedFile(files[files.length - 1].name);
                }
            } catch (err) {
                if (!cancelled) setLogError(err instanceof Error ? err.message : String(err));
            }
        })();

        return () => { cancelled = true; };
    }, [tab, selectedFile]);

    const loadLogTail = useCallback(async () => {
        if (!selectedFile) return;
        setLogLoading(true);
        setLogError('');
        try {
            const data = await fetchDevLogTail({ service: 'alert_dispatch', file: selectedFile, lines: logLines });
            setLogContent(Array.isArray(data.content) ? data.content : []);
        } catch (err) {
            setLogError(err instanceof Error ? err.message : String(err));
        } finally {
            setLogLoading(false);
        }
    }, [selectedFile, logLines]);

    useEffect(() => {
        if (tab === 'logs' && selectedFile) {
            loadLogTail();
        }
    }, [tab, selectedFile, logLines, loadLogTail]);

    /* ── Derived ──────────────────────── */
    const filteredEvents = useMemo(
        () => events.filter(e => activeChannels.has(e.channel)),
        [events, activeChannels]
    );

    const filteredLogLines = useMemo(() => {
        if (!logFilter) return logContent;
        const q = logFilter.toLowerCase();
        return logContent.filter(line => String(line).toLowerCase().includes(q));
    }, [logContent, logFilter]);

    const totalCount = useMemo(
        () => Object.values(counts).reduce((a, b) => a + b, 0),
        [counts]
    );

    /* ── Heartbeat derived ─────────────── */
    const heartbeatAge = heartbeat ? Date.now() - heartbeat.receivedAt : null;
    const heartbeatStale = heartbeat && heartbeatAge > (heartbeat.scan_interval || 60) * 3000;

    /* ── Handlers ──────────────────────── */
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

    /* ═══════════════════════════════════════════════════════════════════════
       Render
       ═══════════════════════════════════════════════════════════════════════ */
    return (
        <div className="min-h-screen bg-dashboard-bg text-white">
            {/* ── Header ──────────────────── */}
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
                            <a href="/" className="text-gray-400 hover:text-white transition-colors text-sm">← Dashboard</a>
                            <div>
                                <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
                                    <span style={{ filter: 'drop-shadow(0 0 6px rgba(239,68,68,0.5))' }}>🎯</span>
                                    Alert Dispatch Monitor
                                </h1>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Live scanner heartbeat, AI dispatch, and alert activity
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            {/* Connection Indicator */}
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

                            {/* Tab Switcher */}
                            <div className="flex rounded-lg overflow-hidden border border-gray-700">
                                <button
                                    onClick={() => setTab('live')}
                                    className={`px-3 py-1.5 text-xs font-medium transition-all ${tab === 'live'
                                            ? 'bg-gradient-to-r from-red-600 to-orange-500 text-white'
                                            : 'bg-gray-800 text-gray-400 hover:text-white'
                                        }`}
                                >
                                    ⚡ Live Feed
                                </button>
                                <button
                                    onClick={() => setTab('logs')}
                                    className={`px-3 py-1.5 text-xs font-medium transition-all ${tab === 'logs'
                                            ? 'bg-gradient-to-r from-blue-600 to-purple-500 text-white'
                                            : 'bg-gray-800 text-gray-400 hover:text-white'
                                        }`}
                                >
                                    📄 Log Files
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-[1600px] mx-auto px-6 py-4 space-y-4">
                {/* ── Heartbeat Panel ──────── */}
                <div
                    className="rounded-xl p-4"
                    style={{
                        background: 'rgba(var(--card-bg), 0.6)',
                        border: `1px solid ${heartbeatStale ? 'rgba(239,68,68,0.25)' : 'rgba(168,85,247,0.15)'}`,
                        boxShadow: heartbeatStale ? '0 0 20px rgba(239,68,68,0.08)' : '0 0 20px rgba(168,85,247,0.05)',
                    }}
                >
                    <div className="flex items-center justify-between mb-3">
                        <div className="text-xs font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                            💓 Scanner Heartbeat
                            <span
                                className="w-2 h-2 rounded-full inline-block"
                                style={{
                                    backgroundColor: heartbeat ? (heartbeatStale ? '#ef4444' : '#a855f7') : '#6b7280',
                                    boxShadow: heartbeat ? `0 0 6px ${heartbeatStale ? '#ef4444' : '#a855f7'}` : 'none',
                                    animation: heartbeat && !heartbeatStale ? 'pulse 2s infinite' : 'none',
                                }}
                            />
                        </div>
                        <span className={`text-xs font-medium ${heartbeatStale ? 'text-red-400' : heartbeat ? 'text-purple-300' : 'text-gray-600'}`}>
                            {heartbeat ? (heartbeatStale ? 'STALE' : 'SYNC') : 'Waiting…'}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <HeartbeatStat label="Last Seen" value={heartbeat ? formatTime(heartbeat.receivedAt) : '—'} />
                        <HeartbeatStat
                            label="Active Workers"
                            value={heartbeat?.assets_scanned?.length ?? '—'}
                            detail={heartbeat?.assets_scanned?.join(', ')}
                        />
                        <HeartbeatStat
                            label="Whitelisted"
                            value={heartbeat?.assets_whitelisted?.length ?? '—'}
                            detail={heartbeat?.assets_whitelisted?.join(', ')}
                        />
                        <HeartbeatStat
                            label="Known Assets"
                            value={heartbeat?.assets_known?.length ?? '—'}
                        />
                        <HeartbeatStat
                            label="Scan Interval"
                            value={heartbeat ? `${heartbeat.scan_interval}s` : '—'}
                        />
                    </div>
                </div>

                {/* ── Tab Content ─────────── */}
                {tab === 'live' ? (
                    /* ═══ LIVE FEED TAB ═══ */
                    <>
                        {/* Stats Row */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            {EVENTS.map(({ key, label, color, icon }) => (
                                <div
                                    key={key}
                                    className="rounded-xl p-3 flex items-center gap-2.5"
                                    style={{
                                        background: 'rgba(var(--card-bg), 0.6)',
                                        border: `1px solid ${color}15`,
                                    }}
                                >
                                    <span className="text-lg">{icon}</span>
                                    <div>
                                        <div className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</div>
                                        <div className="text-sm font-semibold" style={{ color }}>{counts[key] || 0}</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Channel Filters + Controls */}
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                            <div className="flex flex-wrap gap-2">
                                {EVENTS.map(({ key, label, color, icon }) => {
                                    const active = activeChannels.has(key);
                                    return (
                                        <button
                                            key={key}
                                            onClick={() => toggleChannel(key)}
                                            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5"
                                            style={{
                                                background: active ? `${color}20` : 'rgba(255,255,255,0.03)',
                                                border: `1px solid ${active ? color : 'rgba(255,255,255,0.08)'}`,
                                                color: active ? color : '#6b7280',
                                            }}
                                        >
                                            <span>{icon}</span> {label}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setPaused(v => !v)}
                                    className="px-3 py-1.5 text-xs rounded-lg font-medium transition-all"
                                    style={{
                                        background: paused
                                            ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                                            : 'linear-gradient(135deg, #22c55e, #16a34a)',
                                        color: '#000',
                                        boxShadow: paused ? '0 0 12px rgba(245,158,11,0.3)' : '0 0 12px rgba(34,197,94,0.3)',
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
                                <span className="text-[11px] text-gray-600">{totalCount} total</span>
                            </div>
                        </div>

                        {/* Event Feed */}
                        <div
                            className="rounded-xl overflow-hidden"
                            style={{
                                background: 'rgba(var(--card-bg), 0.6)',
                                border: '1px solid rgba(255,255,255,0.06)',
                            }}
                        >
                            <div
                                className="grid px-4 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wider"
                                style={{
                                    gridTemplateColumns: '90px 100px 1fr',
                                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                                    background: 'rgba(0,0,0,0.2)',
                                }}
                            >
                                <span>Time</span>
                                <span>Event</span>
                                <span>Summary</span>
                            </div>

                            <div className="max-h-[55vh] overflow-y-auto">
                                {filteredEvents.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-16 text-gray-600">
                                        <div className="text-3xl mb-3">🎯</div>
                                        <div className="text-sm">{connected ? 'Waiting for dispatch events…' : 'Not connected to backend'}</div>
                                        <div className="text-xs text-gray-700 mt-1">Alerts, heartbeats, and signals will appear here</div>
                                    </div>
                                ) : (
                                    filteredEvents.map((evt) => {
                                        const ch = EVENT_MAP[evt.channel];
                                        const isExpanded = expandedId === evt.id;
                                        return (
                                            <div key={evt.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => setExpandedId(isExpanded ? null : evt.id)}
                                                    className="w-full grid px-4 py-2 text-xs text-left transition-colors hover:bg-white/[0.03] cursor-pointer"
                                                    style={{
                                                        gridTemplateColumns: '90px 100px 1fr',
                                                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                                                    }}
                                                >
                                                    <span className="text-gray-500 font-mono text-[11px]">{formatTime(evt.ts)}</span>
                                                    <span className="font-medium text-[11px] flex items-center gap-1" style={{ color: ch?.color || '#9ca3af' }}>
                                                        <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: ch?.color, boxShadow: `0 0 4px ${ch?.color}` }} />
                                                        {ch?.label || evt.channel}
                                                    </span>
                                                    <span className="text-gray-400 truncate">{summarizeEvent(evt.channel, evt.data)}</span>
                                                </button>
                                                {isExpanded && (
                                                    <div className="px-6 py-3" style={{ background: 'rgba(0,0,0,0.3)', borderBottom: `2px solid ${ch?.color || '#333'}` }}>
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
                    </>
                ) : (
                    /* ═══ LOG FILES TAB ═══ */
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                        {/* Sidebar */}
                        <div
                            className="rounded-xl p-4 space-y-3"
                            style={{
                                background: 'rgba(var(--card-bg), 0.6)',
                                border: '1px solid rgba(255,255,255,0.06)',
                            }}
                        >
                            <div className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Log Files</div>

                            <div>
                                <label className="block text-xs text-gray-400 mb-1">File ({logFiles.length})</label>
                                <select
                                    value={selectedFile}
                                    onChange={(e) => setSelectedFile(e.target.value)}
                                    className="w-full bg-black/30 border border-gray-800 rounded px-2 py-1.5 text-sm text-gray-200"
                                >
                                    {logFiles.map(f => (
                                        <option key={f.name} value={f.name}>{f.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Lines</label>
                                <input
                                    type="number"
                                    value={logLines}
                                    min={10}
                                    max={1000}
                                    onChange={(e) => setLogLines(Number(e.target.value || 200))}
                                    className="w-full bg-black/30 border border-gray-800 rounded px-2 py-1.5 text-sm text-gray-200"
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Filter</label>
                                <input
                                    value={logFilter}
                                    onChange={(e) => setLogFilter(e.target.value)}
                                    placeholder="e.g. error, AI, Scanner"
                                    className="w-full bg-black/30 border border-gray-800 rounded px-2 py-1.5 text-sm text-gray-200"
                                />
                            </div>

                            <div className="flex flex-wrap gap-1.5">
                                {LOG_FILTERS.map(item => (
                                    <button
                                        key={item.value}
                                        onClick={() => setLogFilter(item.value)}
                                        className="px-2 py-1 text-[10px] rounded bg-black/20 border border-gray-800 text-gray-400 hover:text-white hover:bg-gray-800 transition-all"
                                    >
                                        {item.label}
                                    </button>
                                ))}
                                <button
                                    onClick={() => setLogFilter('')}
                                    className="px-2 py-1 text-[10px] rounded bg-black/20 border border-gray-800 text-gray-500 hover:text-white hover:bg-gray-800 transition-all"
                                >
                                    Clear
                                </button>
                            </div>

                            <button
                                onClick={loadLogTail}
                                className="w-full px-3 py-1.5 text-xs rounded-lg font-medium transition-all"
                                style={{
                                    background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                                    color: '#fff',
                                }}
                            >
                                Refresh
                            </button>
                        </div>

                        {/* Log Output */}
                        <div
                            className="lg:col-span-3 rounded-xl p-4"
                            style={{
                                background: 'rgba(var(--card-bg), 0.6)',
                                border: '1px solid rgba(255,255,255,0.06)',
                            }}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <div className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Output</div>
                                <span className="text-[11px] text-gray-500">
                                    {logLoading ? 'Loading…' : `${filteredLogLines.length}/${logContent.length} lines`}
                                </span>
                            </div>

                            {logError && (
                                <div className="p-3 rounded border border-red-700 bg-red-900/20 text-red-200 text-sm mb-3">{logError}</div>
                            )}

                            <pre className="text-[11px] text-gray-300 whitespace-pre-wrap break-words max-h-[60vh] overflow-auto font-mono leading-relaxed">
                                {filteredLogLines.length > 0 ? filteredLogLines.join('\n') : (
                                    selectedFile ? 'No matching lines.' : 'Select a log file to begin.'
                                )}
                            </pre>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

/* ── Heartbeat Stat Sub-Component ─────────────────────────────────── */
function HeartbeatStat({ label, value, detail }) {
    const [showDetail, setShowDetail] = useState(false);

    return (
        <div
            className="relative cursor-default"
            onMouseEnter={() => detail && setShowDetail(true)}
            onMouseLeave={() => setShowDetail(false)}
        >
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</div>
            <div className="text-sm font-semibold text-gray-200">{value}</div>
            {showDetail && detail && (
                <div
                    className="absolute z-40 top-full left-0 mt-1 p-2 rounded-lg text-[10px] text-gray-300 whitespace-nowrap max-w-xs overflow-hidden"
                    style={{
                        background: 'rgba(0,0,0,0.9)',
                        border: '1px solid rgba(168,85,247,0.3)',
                        backdropFilter: 'blur(8px)',
                    }}
                >
                    {detail}
                </div>
            )}
        </div>
    );
}

export default AlertDispatchPage;
