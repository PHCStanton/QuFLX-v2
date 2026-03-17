/**
 * IndicatorTimeframeWarning
 *
 * Fix 3: Popup shown when the indicator API returns 404 (no CSV collected for
 * the selected timeframe). Replaces the generic red error banner with a clear,
 * actionable reminder to collect candles first.
 *
 * - Shown once per session per asset|timeframe key (tracked via shownKeys ref)
 * - Reads indicatorWarning from marketStore; clears it on dismiss
 * - "Go Collect" navigates to the Data Source / History panel
 * - No new UI libraries — Tailwind + lucide-react only
 */

import React, { useEffect, useRef } from 'react';
import { AlertTriangle, X, Database } from 'lucide-react';
import useMarketStore from '../store/marketStore';

const IndicatorTimeframeWarning = () => {
  const indicatorWarning = useMarketStore((s) => s.indicatorWarning);
  const clearIndicatorWarning = useMarketStore((s) => s.clearIndicatorWarning);
  const setActiveTab = useMarketStore((s) => s.setActiveTab);

  // Track which asset|timeframe combos have already been shown this session
  // so the popup doesn't re-appear on every indicator poll cycle.
  const shownKeys = useRef(new Set());

  // When a new warning arrives, check if we've already shown it this session.
  // If yes, clear it immediately (silent suppression). If no, mark it shown.
  useEffect(() => {
    if (!indicatorWarning) return;
    const key = `${indicatorWarning.asset}|${indicatorWarning.timeframe}`;
    if (shownKeys.current.has(key)) {
      // Already shown once — suppress silently
      clearIndicatorWarning();
    } else {
      shownKeys.current.add(key);
    }
  }, [indicatorWarning, clearIndicatorWarning]);

  if (!indicatorWarning) return null;

  const { asset, timeframe } = indicatorWarning;

  const handleDismiss = () => {
    clearIndicatorWarning();
  };

  const handleGoCollect = () => {
    clearIndicatorWarning();
    // Navigate to the Data Source panel where history collection lives
    setActiveTab('settings');
  };

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleDismiss}
      role="dialog"
      aria-modal="true"
      aria-labelledby="itw-title"
    >
      {/* Modal card — stop click propagation so clicking inside doesn't dismiss */}
      <div
        className="relative w-full max-w-md mx-4 rounded-2xl border border-yellow-500/40 bg-gray-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-gray-800">
          <div className="flex-shrink-0 mt-0.5 p-2 rounded-lg bg-yellow-500/15">
            <AlertTriangle className="w-5 h-5 text-yellow-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2
              id="itw-title"
              className="text-sm font-semibold text-white leading-snug"
            >
              No {timeframe} Data for {asset}
            </h2>
            <p className="mt-0.5 text-xs text-gray-400">
              Indicators cannot be calculated without collected candles.
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 p-1 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-3">
          <p className="text-sm text-gray-300 leading-relaxed">
            You switched to the <span className="font-semibold text-yellow-300">{timeframe}</span> timeframe,
            but no history has been collected for{' '}
            <span className="font-semibold text-white">{asset}</span> at this interval yet.
          </p>
          <div className="rounded-lg bg-gray-800/60 border border-gray-700 p-3 text-xs text-gray-400 space-y-1">
            <p className="font-semibold text-gray-300">To fix this:</p>
            <ol className="list-decimal list-inside space-y-0.5 pl-1">
              <li>Make sure the chart is set to <span className="text-yellow-300">{timeframe}</span></li>
              <li>Go to <span className="text-white font-medium">Settings → Data Source</span></li>
              <li>Run <span className="text-white font-medium">History Collection</span> for this asset</li>
            </ol>
          </div>
        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-end gap-2 px-5 pb-5">
          <button
            onClick={handleDismiss}
            className="px-4 py-2 text-xs font-medium rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
          >
            Dismiss
          </button>
          <button
            onClick={handleGoCollect}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-yellow-500/20 border border-yellow-500/40 text-yellow-300 hover:bg-yellow-500/30 transition-colors"
          >
            <Database className="w-3.5 h-3.5" />
            Go Collect
          </button>
        </div>
      </div>
    </div>
  );
};

export default IndicatorTimeframeWarning;
