import { useState, useCallback, useRef } from 'react';
import Card from './Card';
import { Upload, FileText, TrendingUp, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import { getApiBaseUrl } from '../api/apiBase';

const StrategyLabPanel = () => {
  const [uploadedFile, setUploadedFile] = useState(null);
  const [fileId, setFileId] = useState(null);
  const [regime, setRegime] = useState(null);
  const [entries, setEntries] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
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

  // Handle drop
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  }, []);

  // Handle file input change
  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  // Upload file to backend
  const handleFileUpload = async (file) => {
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

      // Check if response is OK
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

      // Parse JSON response
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

      // Auto-analyze after upload
      await analyzeRegime(data.file_id);
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.message || 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  // Analyze regime
  const analyzeRegime = async (fid) => {
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

      // Auto-identify entries after regime detection
      if (data.is_tradeable) {
        await identifyEntries(fid);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Identify entry signals
  const identifyEntries = async (fid) => {
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
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Reset state
  const handleReset = () => {
    setUploadedFile(null);
    setFileId(null);
    setRegime(null);
    setEntries([]);
    setStats(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="col-span-3 flex flex-col gap-3 h-full min-h-0">
      {/* Header */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
              Strategy Lab
            </h3>
            <p className="text-xs text-text-secondary mt-1">
              Upload historical data to test regime detection and entry strategies
            </p>
          </div>
          {uploadedFile && (
            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-xs bg-accent-primary/10 hover:bg-accent-primary/20 text-accent-primary rounded-lg transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </Card>

      {/* Upload Zone */}
      {!uploadedFile && (
        <Card className="p-6 flex-1">
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
        </Card>
      )}

      {/* Analysis Results */}
      {uploadedFile && (
        <div className="flex-1 flex flex-col gap-3 min-h-0">
          {/* File Info */}
          <Card className="p-4">
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
          </Card>

          {/* Regime Display */}
          {regime && (
            <Card className="p-4">
              <div className="flex items-start gap-3">
                <TrendingUp className="w-5 h-5 text-accent-primary mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-text-primary">Market Regime</h4>
                    <span className={`px-2 py-1 text-xs rounded-full ${regime.is_tradeable
                      ? 'bg-green-500/10 text-green-400'
                      : 'bg-gray-500/10 text-gray-400'
                      }`}>
                      {regime.is_tradeable ? 'Tradeable' : 'Neutral'}
                    </span>
                  </div>
                  <p className="text-sm text-text-primary font-medium mb-1">{regime.regime}</p>
                  <div className="flex items-center gap-4 text-xs text-text-secondary">
                    <span>Direction: <span className="text-text-primary">{regime.direction || 'N/A'}</span></span>
                    <span>Confidence: <span className="text-text-primary">{regime.confluence_score || 0}%</span></span>
                    <span>Expiry: <span className="text-text-primary">{regime.suggested_expiry || 'N/A'}</span></span>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Entry Signals Table */}
          {entries.length > 0 && (
            <Card className="p-4 flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-text-primary">Entry Signals</h4>
                <span className="text-xs text-text-secondary">
                  {entries.length} signal{entries.length !== 1 ? 's' : ''} found
                </span>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card-bg border-b border-border-primary">
                    <tr className="text-left text-text-secondary">
                      <th className="pb-2 font-medium">Direction</th>
                      <th className="pb-2 font-medium">Entry Price</th>
                      <th className="pb-2 font-medium">Confidence</th>
                      <th className="pb-2 font-medium">Expiry</th>
                      <th className="pb-2 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry, idx) => (
                      <tr key={idx} className="border-b border-border-primary/50 hover:bg-accent-primary/5">
                        <td className="py-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${entry.direction === 'CALL'
                            ? 'bg-green-500/10 text-green-400'
                            : 'bg-red-500/10 text-red-400'
                            }`}>
                            {entry.direction}
                          </span>
                        </td>
                        <td className="py-2 text-text-primary">{entry.entry_price.toFixed(5)}</td>
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-border-primary rounded-full overflow-hidden">
                              <div
                                className="h-full bg-accent-primary"
                                style={{ width: `${entry.confidence * 100}%` }}
                              />
                            </div>
                            <span className="text-text-primary">{Math.round(entry.confidence * 100)}%</span>
                          </div>
                        </td>
                        <td className="py-2 text-text-primary">{entry.suggested_expiry}</td>
                        <td className="py-2 text-text-secondary max-w-xs truncate" title={entry.reason}>
                          {entry.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Stats */}
              {stats && (
                <div className="mt-3 pt-3 border-t border-border-primary flex items-center gap-6 text-xs">
                  <div>
                    <span className="text-text-secondary">Avg Confidence: </span>
                    <span className="text-text-primary font-medium">
                      {Math.round((stats.avg_confidence || 0) * 100)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-text-secondary">Total Signals: </span>
                    <span className="text-text-primary font-medium">{stats.total_signals}</span>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* No Entries Message */}
          {regime && regime.is_tradeable && entries.length === 0 && !loading && (
            <Card className="p-6 flex-1 flex items-center justify-center">
              <div className="text-center text-text-secondary">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No entry signals found for this regime</p>
              </div>
            </Card>
          )}

          {/* Error Display */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StrategyLabPanel;
