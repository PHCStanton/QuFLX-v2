import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getApiBaseUrl } from '../api/apiBase';
import {
  fetchDevLogsIndex,
  fetchDevLogsState,
  fetchDevLogTail,
  setGatewayLogLevel,
} from '../api/devLogsClient';

const formatBytes = (bytes) => {
  if (typeof bytes !== 'number' || Number.isNaN(bytes)) return '-';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
};

const formatDurationMs = (value) => {
  if (!Number.isFinite(value)) return '-';
  const seconds = Math.max(0, Math.round(value / 1000));
  return `${seconds}s`;
};

const DevLogsPage = ({
  title = 'Dev Logs',
  description = '',
  defaultService = 'gateway',
  defaultFile = 'gateway.log',
  initialFilter = '',
  quickFilters = [],
  showHeartbeatPanel = false
}) => {
  const [index, setIndex] = useState(null);
  const [state, setState] = useState(null);
  const [selectedService, setSelectedService] = useState(defaultService);
  const [selectedFile, setSelectedFile] = useState(defaultFile);
  const [lines, setLines] = useState(200);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshMs, setRefreshMs] = useState(1500);
  const [filter, setFilter] = useState(initialFilter);
  const [content, setContent] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [heartbeat, setHeartbeat] = useState(null);
  const [copyStatus, setCopyStatus] = useState('');

  const timerRef = useRef(null);

  const services = useMemo(() => (index && Array.isArray(index.services) ? index.services : []), [index]);
  const filesForService = useMemo(() => {
    const svc = services.find((s) => s.name === selectedService);
    return svc && Array.isArray(svc.files) ? svc.files : [];
  }, [services, selectedService]);

  const filteredLines = useMemo(() => {
    if (!filter) return content;
    const q = filter.toLowerCase();
    return content.filter((line) => String(line).toLowerCase().includes(q));
  }, [content, filter]);

  const loadIndex = useCallback(async () => {
    const data = await fetchDevLogsIndex();
    setIndex(data);
  }, []);

  const loadState = useCallback(async () => {
    const data = await fetchDevLogsState();
    setState(data);
  }, []);

  const ensureDefaults = useCallback((nextIndex) => {
    if (!nextIndex || !Array.isArray(nextIndex.services)) return;
    const svc = nextIndex.services.find((s) => s.name === selectedService) || nextIndex.services[0];
    if (!svc) return;
    const nextService = svc.name;
    const nextFiles = Array.isArray(svc.files) ? svc.files : [];
    const nextFile = nextFiles.find((f) => f.name === selectedFile)?.name || nextFiles[0]?.name;

    if (nextService && nextService !== selectedService) setSelectedService(nextService);
    if (nextFile && nextFile !== selectedFile) setSelectedFile(nextFile);
  }, [selectedFile, selectedService]);

  const loadTail = useCallback(async () => {
    if (!selectedService || !selectedFile) return;
    setIsLoading(true);
    setError('');
    try {
      const data = await fetchDevLogTail({ service: selectedService, file: selectedFile, lines });
      setContent(Array.isArray(data.content) ? data.content : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [selectedService, selectedFile, lines]);

  useEffect(() => {
    let mounted = true;
    Promise.all([loadIndex(), loadState()])
      .then(([idx]) => {
        if (!mounted) return;
        ensureDefaults(idx);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      mounted = false;
    };
  }, [loadIndex, loadState, ensureDefaults]);

  useEffect(() => {
    void loadTail();
  }, [loadTail]);

  useEffect(() => {
    if (!autoRefresh) {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      void loadTail();
    }, Math.max(500, refreshMs));

    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [autoRefresh, refreshMs, loadTail]);

  const handleSetLevel = async (level) => {
    setError('');
    try {
      await setGatewayLogLevel(level);
      await loadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const resolveServiceSelection = useCallback((serviceName) => {
    if (!Array.isArray(services) || services.length === 0) return;
    const svc = services.find((s) => s.name === serviceName);
    if (!svc) {
      setError(`Service "${serviceName}" not found.`);
      return;
    }
    const nextFiles = Array.isArray(svc.files) ? svc.files : [];
    setSelectedService(serviceName);
    if (!nextFiles.length) {
      setSelectedFile('');
      return;
    }
    const nextFile = nextFiles.find((f) => f.name === selectedFile)?.name || nextFiles[0].name;
    setSelectedFile(nextFile);
  }, [services, selectedFile]);

  const handleCopyLastLines = async () => {
    setError('');
    setCopyStatus('');
    try {
      if (!selectedService || !selectedFile) {
        throw new Error('Select a service and file first.');
      }
      if (!navigator?.clipboard) {
        throw new Error('Clipboard API unavailable in this context.');
      }
      const targetLines = 200;
      const data = await fetchDevLogTail({ service: selectedService, file: selectedFile, lines: targetLines });
      const linesArr = Array.isArray(data.content) ? data.content : [];
      await navigator.clipboard.writeText(linesArr.join('\n'));
      setContent(linesArr);
      setLines(targetLines);
      setCopyStatus(`Copied ${linesArr.length} lines`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      window.setTimeout(() => setCopyStatus(''), 2000);
    }
  };

  useEffect(() => {
    if (!showHeartbeatPanel) return;
    const socket = io(getApiBaseUrl(), {
      transports: ['websocket', 'polling'],
      autoConnect: true
    });
    const onHeartbeat = (data) => {
      setHeartbeat({ ...data, receivedAt: Date.now() });
    };
    socket.on('scan_heartbeat', onHeartbeat);
    return () => {
      socket.off('scan_heartbeat', onHeartbeat);
      socket.disconnect();
    };
  }, [showHeartbeatPanel]);

  const heartbeatAgeMs = heartbeat ? Date.now() - heartbeat.receivedAt : null;
  const heartbeatIntervalMs = heartbeat ? Number(heartbeat.scan_interval || 60) * 1000 : null;
  const heartbeatStaleMs = heartbeatIntervalMs ? heartbeatIntervalMs * 3 : null;
  const heartbeatStale = heartbeat && heartbeatStaleMs ? heartbeatAgeMs > heartbeatStaleMs : false;

  return (
    <div className="min-h-screen bg-dashboard-bg text-white p-4">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold">{title}</h1>
            <div className="text-xs text-gray-400 mt-1">
              Base: {index?.base_dir || '-'} · Gateway level: {state?.gateway_log_level || '-'} · Debug errors: {String(!!state?.debug_errors)}
            </div>
            {description ? (
              <div className="text-xs text-gray-500 mt-1">{description}</div>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {['DEBUG', 'INFO', 'WARNING', 'ERROR'].map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => void handleSetLevel(lvl)}
                className="px-3 py-1.5 text-xs rounded bg-[#0f1419] border border-gray-800 text-gray-200 hover:bg-gray-800"
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <div className="p-3 rounded border border-red-700 bg-red-900/20 text-red-200 text-sm">{error}</div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-[#0f1419] border border-gray-800 rounded-xl p-4 space-y-3">
            <div className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Controls</div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Service</label>
              <select
                value={selectedService}
                onChange={(e) => {
                  setSelectedService(e.target.value);
                  setSelectedFile('');
                }}
                className="w-full bg-black/30 border border-gray-800 rounded px-2 py-1.5 text-sm"
              >
                {services.map((s) => (
                  <option key={s.name} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">File</label>
              <select
                value={selectedFile}
                onChange={(e) => setSelectedFile(e.target.value)}
                className="w-full bg-black/30 border border-gray-800 rounded px-2 py-1.5 text-sm"
              >
                {filesForService.map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.name} ({formatBytes(f.size_bytes)})
                  </option>
                ))}
              </select>
              <div className="text-[11px] text-gray-500 mt-1">
                {filesForService.find((f) => f.name === selectedFile)?.modified_at || ''}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Lines</label>
                <input
                  type="number"
                  value={lines}
                  min={10}
                  max={1000}
                  onChange={(e) => setLines(Number(e.target.value || 200))}
                  className="w-full bg-black/30 border border-gray-800 rounded px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Refresh (ms)</label>
                <input
                  type="number"
                  value={refreshMs}
                  min={500}
                  max={15000}
                  onChange={(e) => setRefreshMs(Number(e.target.value || 1500))}
                  className="w-full bg-black/30 border border-gray-800 rounded px-2 py-1.5 text-sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void loadTail()}
                className="px-3 py-1.5 text-xs rounded bg-accent-green text-black font-semibold hover:bg-emerald-400"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => setAutoRefresh((v) => !v)}
                className="px-3 py-1.5 text-xs rounded bg-[#0f1419] border border-gray-800 text-gray-200 hover:bg-gray-800"
              >
                Auto: {autoRefresh ? 'On' : 'Off'}
              </button>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Filter</label>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="e.g. error_id= or gateway.ai"
                className="w-full bg-black/30 border border-gray-800 rounded px-2 py-1.5 text-sm"
              />
            </div>
            {quickFilters.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {quickFilters.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setFilter(item.value)}
                    className="px-2.5 py-1 text-[11px] rounded bg-[#0f1419] border border-gray-800 text-gray-200 hover:bg-gray-800"
                  >
                    {item.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setFilter('')}
                  className="px-2.5 py-1 text-[11px] rounded bg-[#0f1419] border border-gray-800 text-gray-400 hover:bg-gray-800"
                >
                  Clear
                </button>
              </div>
            ) : null}
            <div className="space-y-2">
              <div className="text-[11px] text-gray-500 uppercase tracking-wider">Quick Switch</div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => resolveServiceSelection('alert_dispatch')}
                  className="px-2.5 py-1 text-[11px] rounded bg-[#0f1419] border border-gray-800 text-gray-200 hover:bg-gray-800"
                >
                  Alert Dispatch
                </button>
                <button
                  type="button"
                  onClick={() => {
                    resolveServiceSelection('gateway');
                    setFilter('AI');
                  }}
                  className="px-2.5 py-1 text-[11px] rounded bg-[#0f1419] border border-gray-800 text-gray-200 hover:bg-gray-800"
                >
                  Gateway AI
                </button>
                <button
                  type="button"
                  onClick={() => resolveServiceSelection('gateway')}
                  className="px-2.5 py-1 text-[11px] rounded bg-[#0f1419] border border-gray-800 text-gray-200 hover:bg-gray-800"
                >
                  Gateway
                </button>
              </div>
            </div>

            <div className="text-[11px] text-gray-500">
              Requires Gateway env: QFLX_ENABLE_DEV_LOGS=1 (local-only)
            </div>
          </div>

          <div className="lg:col-span-2 bg-[#0f1419] border border-gray-800 rounded-xl p-4">
            {showHeartbeatPanel ? (
              <div className="mb-4 rounded-lg border border-gray-800 bg-black/20 p-3">
                <div className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">Heartbeat</div>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-300">
                  <div>
                    <div className="text-[11px] text-gray-500">Last Seen</div>
                    <div>{heartbeat ? new Date(heartbeat.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-500">Status</div>
                    <div className={heartbeatStale ? 'text-red-400' : 'text-emerald-300'}>
                      {heartbeat ? (heartbeatStale ? 'Stale' : 'Sync') : 'Waiting'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-500">Age</div>
                    <div>{formatDurationMs(heartbeatAgeMs)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-500">Stale After</div>
                    <div>{formatDurationMs(heartbeatStaleMs)}</div>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Output</div>
              <div className="flex items-center gap-2">
                <div className="text-[11px] text-gray-500">{isLoading ? 'Loading…' : `${filteredLines.length}/${content.length} lines`}</div>
                <button
                  type="button"
                  onClick={() => void handleCopyLastLines()}
                  className="px-2 py-1 text-[11px] rounded bg-[#0f1419] border border-gray-800 text-gray-200 hover:bg-gray-800"
                >
                  Copy 200
                </button>
              </div>
            </div>
            {copyStatus ? (
              <div className="text-[11px] text-emerald-300 mb-2">{copyStatus}</div>
            ) : null}
            <pre className="text-xs text-gray-200 whitespace-pre-wrap break-words max-h-[70vh] overflow-auto">
              {filteredLines.join('\n')}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DevLogsPage;

