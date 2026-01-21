import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const DevLogsPage = () => {
  const [index, setIndex] = useState(null);
  const [state, setState] = useState(null);
  const [selectedService, setSelectedService] = useState('gateway');
  const [selectedFile, setSelectedFile] = useState('gateway.log');
  const [lines, setLines] = useState(200);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshMs, setRefreshMs] = useState(1500);
  const [filter, setFilter] = useState('');
  const [content, setContent] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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

  return (
    <div className="min-h-screen bg-dashboard-bg text-white p-4">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold">Dev Logs</h1>
            <div className="text-xs text-gray-400 mt-1">
              Base: {index?.base_dir || '-'} · Gateway level: {state?.gateway_log_level || '-'} · Debug errors: {String(!!state?.debug_errors)}
            </div>
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

            <div className="text-[11px] text-gray-500">
              Requires Gateway env: QFLX_ENABLE_DEV_LOGS=1 (local-only)
            </div>
          </div>

          <div className="lg:col-span-2 bg-[#0f1419] border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Output</div>
              <div className="text-[11px] text-gray-500">{isLoading ? 'Loading…' : `${filteredLines.length}/${content.length} lines`}</div>
            </div>
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

