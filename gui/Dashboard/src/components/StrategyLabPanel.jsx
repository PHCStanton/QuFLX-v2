import { useState, useCallback, useRef, useEffect } from 'react';
import { createChart } from 'lightweight-charts';
import { prepareChartData } from '../utils/chartData';
import CollapsiblePanel from './CollapsiblePanel';
import { Upload, FileText, TrendingUp, AlertCircle, Loader, Brain, Shield, ExternalLink } from 'lucide-react';
import { getApiBaseUrl } from '../api/apiBase';
import useMarketStore from '../store/marketStore';

const StrategyLabPanel = () => {
  const [uploadedFile, setUploadedFile] = useState(null);
  const [fileId, setFileId] = useState(null);
  const [regime, setRegime] = useState(null);
  const [entries, setEntries] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { addStrategyLabFile, setSelectedStrategyFileId } = useMarketStore();
  const [dragActive, setDragActive] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const fileInputRef = useRef(null);

  // Handle drag events
  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const aiAnalyze = useCallback(async (fid, strategyStats, regimeName, entriesData) => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/v1/strategy/ai-analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_id: fid,
          regime_name: regimeName,
          stats: strategyStats
        }),
      });
      const data = await response.json();
      if (data.ok) {
        setAiAnalysis(data.analysis);
        // Add full file info to store for global access (includes entries for chart)
        addStrategyLabFile({
          file_id: fid,
          filename: uploadedFile?.name || fid,
          regime: regimeName,
          stats: strategyStats,
          analysis: data.analysis,
          entries: entriesData || []
        });
      }
    } catch (err) {
      console.error('AI Analysis failed:', err);
    }
  }, [addStrategyLabFile, uploadedFile]);

  const fetchFullData = useCallback(async (fid) => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/v1/strategy/data/${fid}`);
      const data = await response.json();
      if (data.ok && chartRef.current) {
        const series = chartRef.current.candlestickSeries;
        if (series) {
          const formatted = prepareChartData(data.candles.map(c => ({
            ...c,
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close)
          })));

          series.setData(formatted);
          chartRef.current.timeScale().fitContent();
        }
      }
    } catch (err) {
      console.error('Failed to fetch full data:', err);
    }
  }, []);

  const identifyEntries = useCallback(async (fid) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/v1/strategy/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_id: fid || fileId }),
      });

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.detail || 'Entry identification failed');
      }

      setEntries(data.entries || []);
      setStats(data.stats);

      // Fetch full candle data for chart
      await fetchFullData(fid || fileId);

      // Trigger AI Analysis (pass entries for chart markers)
      if (data.stats && data.regime) {
        await aiAnalyze(fid || fileId, data.stats, data.regime, data.entries || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [fileId, aiAnalyze, fetchFullData]);

  const analyzeRegime = useCallback(async (fid) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/v1/strategy/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_id: fid || fileId }),
      });

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.detail || 'Analysis failed');
      }

      setRegime(data);

      if (data.is_tradeable) {
        await identifyEntries(fid);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [fileId, identifyEntries]);

  const handleFileUpload = useCallback(async (file) => {
    if (!file.name.endsWith('.csv')) {
      setError('Only CSV files are supported');
      return;
    }

    setLoading(true);
    setError(null);
    setRegime(null);
    setEntries([]);
    setStats(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${getApiBaseUrl()}/api/v1/strategy/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const text = await response.text();
        let errorMsg = `Upload failed (${response.status})`;
        try {
          const errorData = JSON.parse(text);
          errorMsg = errorData.detail || errorMsg;
        } catch {
          errorMsg = text || errorMsg;
        }
        throw new Error(errorMsg);
      }

      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        console.error('JSON parse error:', jsonError);
        const text = await response.text();
        throw new Error(`Invalid server response: ${text.substring(0, 100)}`);
      }

      if (!data.ok) {
        throw new Error(data.detail || 'Upload failed');
      }

      setUploadedFile({
        name: file.name,
        rows: data.rows,
        dateRange: data.date_range,
      });
      setFileId(data.file_id);

      await analyzeRegime(data.file_id);
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.message || 'Upload failed');
    } finally {
      setLoading(false);
    }
  }, [analyzeRegime]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  }, [handleFileUpload]);

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  // Reset state
  const handleReset = () => {
    setUploadedFile(null);
    setFileId(null);
    setRegime(null);
    setEntries([]);
    setStats(null);
    setAiAnalysis(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }
  };

  // Chart Implementation
  useEffect(() => {
    if (!chartContainerRef.current || !uploadedFile || entries.length === 0) return;

    if (!chartRef.current) {
      const chart = createChart(chartContainerRef.current, {
        layout: { background: { color: 'transparent' }, textColor: '#94a3b8' },
        grid: { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
        width: chartContainerRef.current.clientWidth,
        height: 300,
        timeScale: { timeVisible: true, secondsVisible: false },
      });

      const candlestickSeries = chart.addCandlestickSeries({
        upColor: '#10b981', downColor: '#ef4444', borderVisible: false,
        wickUpColor: '#10b981', wickDownColor: '#ef4444'
      });

      // Mapping entries to markers
      const markers = entries.map(entry => ({
        time: Math.floor(new Date(entry.timestamp).getTime() / 1000),
        position: entry.direction === 'CALL' ? 'belowBar' : 'aboveBar',
        color: entry.direction === 'CALL' ? '#10b981' : '#ef4444',
        shape: entry.direction === 'CALL' ? 'arrowUp' : 'arrowDown',
        text: entry.direction,
      }));

      candlestickSeries.setMarkers(markers);
      chartRef.current = chart;
      chartRef.current.candlestickSeries = candlestickSeries;

      // Fetch data now if not already loaded
      fetchFullData(fileId);
    }
  }, [uploadedFile, entries, fileId, fetchFullData]);

  return (
    <div className="col-span-3 flex flex-col gap-3 h-full min-h-0 bg-dashboard-bg p-2 custom-scrollbar overflow-y-auto">
      <CollapsiblePanel
        id="strategy-lab-header"
        className="bg-section-bg"
        headerLeft={
          <div>
            <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
              Strategy Lab
            </h3>
            <p className="text-xs text-text-secondary mt-1">
              Upload historical data to test regime detection and entry strategies
            </p>
          </div>
        }
        headerRight={
          uploadedFile ? (
            <div onClick={(e) => e.stopPropagation()}>
              <button
                onClick={handleReset}
                className="px-3 py-1.5 text-xs bg-accent-primary/10 hover:bg-accent-primary/20 text-accent-primary rounded-lg transition-colors"
              >
                Reset
              </button>
            </div>
          ) : null
        }
      />

      {!uploadedFile && (
        <CollapsiblePanel
          id="strategy-lab-upload"
          title="Upload Zone"
          expandable={true}
          className="bg-section-bg"
          bodyClassName="p-6"
        >
          <div
            className={`border-2 border-dashed rounded-xl p-8 transition-all ${dragActive
              ? 'border-accent-primary bg-accent-primary/5'
              : 'border-border-primary hover:border-accent-primary/50'
              }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <div className="flex flex-col items-center justify-center gap-4 text-center">
              <Upload className="w-12 h-12 text-accent-primary" />
              <div>
                <p className="text-sm font-medium text-text-primary mb-1">
                  Drop CSV file here or click to browse
                </p>
                <p className="text-xs text-text-secondary">
                  Required columns: timestamp, open, high, low, close
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileInputChange}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="px-4 py-2 bg-accent-primary hover:bg-accent-primary/90 text-white text-sm rounded-lg cursor-pointer transition-colors"
              >
                Select File
              </label>
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}
        </CollapsiblePanel>
      )}

      {/* Analysis Results */}
      {uploadedFile && (
        <div className="flex flex-col gap-3 min-h-0">
          <CollapsiblePanel
            id="strategy-lab-file-info"
            title="File Info"
            expandable={true}
            className="bg-section-bg"
            bodyClassName="p-4"
          >
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-accent-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium text-text-primary">{uploadedFile.name}</p>
                <p className="text-xs text-text-secondary">
                  {uploadedFile.rows} rows • {uploadedFile.dateRange?.start} to {uploadedFile.dateRange?.end}
                </p>
              </div>
              {loading && <Loader className="w-4 h-4 text-accent-primary animate-spin" />}
            </div>
          </CollapsiblePanel>

          {regime && (
            <CollapsiblePanel
              id="strategy-lab-market-regime"
              expandable={true}
              className="bg-section-bg"
              bodyClassName="p-4"
              headerLeft={
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-accent-primary" />
                  <h4 className="text-sm font-semibold text-text-primary">Market Regime</h4>
                </div>
              }
              headerRight={
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => {
                      // Promote to main chart view - only set the file ID
                      // Do NOT call setSelectedAsset as it triggers live history loading
                      // The Strategy Lab chart uses its own data from strategyLabData
                      setSelectedStrategyFileId(fileId);
                    }}
                    className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold bg-accent-primary text-black rounded hover:opacity-90 transition-all uppercase tracking-tight"
                    title="Show on Main Chart"
                  >
                    <ExternalLink size={10} />
                    Promote
                  </button>
                  <span className={`px-2 py-1 text-xs rounded-full ${regime.is_tradeable
                    ? 'bg-green-500/10 text-green-400'
                    : 'bg-gray-500/10 text-gray-400'
                    }`}>
                    {regime.is_tradeable ? 'Tradeable' : 'Neutral'}
                  </span>
                </div>
              }
            >
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div className="p-3 bg-card-bg rounded-lg border border-border-primary">
                  <p className="text-xs text-text-secondary mb-1">Detected Regime</p>
                  <p className="text-sm font-semibold text-accent-primary">{regime.regime}</p>
                </div>
                {stats && (
                  <>
                    <div className="p-3 bg-card-bg rounded-lg border border-border-primary">
                      <p className="text-xs text-text-secondary mb-1">Win Rate</p>
                      <p className={`text-sm font-semibold ${(stats.win_rate ?? 0) >= 0.6 ? 'text-green-400' : 'text-yellow-400'}`}>
                        {Math.round((stats.win_rate ?? 0) * 100)}%
                      </p>
                    </div>
                    <div className="p-3 bg-card-bg rounded-lg border border-border-primary">
                      <p className="text-xs text-text-secondary mb-1">Net P&L (Stakes)</p>
                      <p className={`text-sm font-semibold ${stats.profit_loss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {(stats.profit_loss ?? 0) > 0 ? '+' : ''}{(stats.profit_loss ?? 0).toFixed(2)}
                      </p>
                    </div>
                  </>
                )}
                <div className="p-3 bg-card-bg rounded-lg border border-border-primary">
                  <p className="text-xs text-text-secondary mb-1">Data Range</p>
                  <p className="text-[10px] font-medium text-text-primary truncate">
                    {uploadedFile.dateRange?.start} - {uploadedFile.dateRange?.end}
                  </p>
                </div>
              </div>

              {/* AI Analysis Card */}
              {aiAnalysis && (
                <div className="mb-4 p-4 bg-accent-primary/5 border border-accent-primary/20 rounded-xl text-left">
                  <div className="flex items-center gap-2 mb-2">
                    <Brain className="w-4 h-4 text-accent-primary" />
                    <h4 className="text-sm font-semibold text-text-primary">AI Strategy Insights</h4>
                    <span className={`ml-auto px-2 py-0.5 rounded text-[10px] font-bold uppercase ${aiAnalysis.risk_level === 'Low' ? 'bg-green-500/20 text-green-400' :
                      aiAnalysis.risk_level === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                      Risk: {aiAnalysis.risk_level}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    {aiAnalysis.assessment}
                  </p>
                  <div className="flex items-start gap-2 text-[10px] font-medium text-accent-primary bg-accent-primary/10 p-2 rounded">
                    <Shield className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span>Recommendation: {aiAnalysis.recommendation}</span>
                  </div>
                </div>
              )}

              {/* Chart Container */}
              <div className="mb-2 bg-black/20 rounded-xl border border-border-primary overflow-hidden">
                <div className="p-2 border-b border-border-primary bg-card-bg/50 flex justify-between items-center">
                  <span className="text-[10px] font-medium text-text-secondary uppercase">Strategy Visualization</span>
                </div>
                <div ref={chartContainerRef} className="w-full" />
              </div>
            </CollapsiblePanel>
          )}

          {entries.length > 0 && (
        <CollapsiblePanel
          id="strategy-lab-entry-signals"
          title="Entry Signals"
          expandable={true}
          className="bg-section-bg"
          bodyClassName="p-0"
        >
          <div className="overflow-x-auto max-h-[400px] custom-scrollbar">
            <table className="w-full text-xs">
              <thead className="bg-card-bg border-b border-border-primary sticky top-0 z-10">
                    <tr className="text-left text-text-secondary">
                      <th className="px-4 py-3 font-semibold uppercase tracking-wider">Direction</th>
                      <th className="px-4 py-3 font-semibold uppercase tracking-wider">Entry Price</th>
                      <th className="px-4 py-3 font-semibold uppercase tracking-wider">Confidence</th>
                      <th className="px-4 py-3 font-semibold uppercase tracking-wider">Expiry</th>
                      <th className="px-4 py-3 font-semibold uppercase tracking-wider">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry, idx) => (
                      <tr key={idx} className="border-b border-border-primary/50 hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight ${entry.direction === 'CALL'
                            ? 'bg-green-500/10 text-green-400'
                            : 'bg-red-500/10 text-red-400'
                            }`}>
                            {entry.direction}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-text-primary font-mono text-[10px]">{(entry.entry_price ?? 0).toFixed(5)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-border-primary/30 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${(entry.confidence ?? 0) > 0.7 ? 'bg-accent-green' : 'bg-accent-primary'}`}
                                style={{ width: `${(entry.confidence ?? 0) * 100}%` }}
                              />
                            </div>
                            <span className="text-text-primary text-[10px] font-medium">{Math.round((entry.confidence ?? 0) * 100)}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-text-primary text-[10px]">{entry.suggested_expiry}</td>
                        <td className="px-4 py-3 text-text-secondary text-[10px] max-w-xs truncate" title={entry.reason}>
                          {entry.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Stats Summary */}
              {stats && (
                <div className="p-4 bg-card-bg/50 border-t border-border-primary flex items-center gap-6 text-[10px] font-medium uppercase tracking-wider">
                  <div>
                    <span className="text-text-secondary">Avg Confidence: </span>
                    <span className="text-text-primary">
                      {Math.round((stats.avg_confidence || 0) * 100)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-text-secondary">Total Signals: </span>
                    <span className="text-text-primary">{stats.total_signals}</span>
                  </div>
                </div>
              )}
            </CollapsiblePanel>
          )}

          {regime && regime.is_tradeable && entries.length === 0 && !loading && (
            <CollapsiblePanel
              id="strategy-lab-no-signals"
              title="Entry Signals"
              expandable={true}
              className="bg-section-bg flex-1 flex items-center justify-center"
              bodyClassName="p-12"
            >
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-6 h-6 text-text-secondary opacity-50" />
                </div>
                <p className="text-sm font-medium text-text-primary mb-1">No entry signals</p>
                <p className="text-xs text-text-secondary">No tradeable patterns found for this regime</p>
              </div>
            </CollapsiblePanel>
          )}

          {/* Error Display */}
          {error && (
            <div className="p-4 bg-accent-red/10 border border-accent-red/20 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-accent-red mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-accent-red mb-1">Analysis Error</p>
                <p className="text-xs text-accent-red/80">{error}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StrategyLabPanel;
