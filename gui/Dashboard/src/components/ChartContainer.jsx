import { useEffect, useRef } from 'react';
import { createChart, CandlestickSeries, createTextWatermark } from 'lightweight-charts';

const formatPriceValue = (price) => {
  if (!Number.isFinite(price)) return '';
  const abs = Math.abs(price);
  let decimals = 2;
  if (abs < 1) {
    decimals = 6;
  } else if (abs < 100) {
    decimals = 5;
  }
  let value = price.toFixed(decimals);
  value = value.replace(/\.0+$/, '').replace(/\.(?=,)/, '.');
  return value.replace(/\.0+$/, '').replace(/\.$/, '');
};

// Convert a raw asset key (e.g. 'AUDUSDOTC' or 'AUD/USD OTC') into a readable label.
const formatAssetLabel = (asset) => {
  if (!asset || typeof asset !== 'string') return '';
  // Already formatted with slash/space — use as-is
  if (asset.includes('/') || asset.includes(' ')) return asset.toUpperCase();
  // Detect OTC suffix
  const isOtc = asset.toUpperCase().endsWith('OTC');
  const base = isOtc ? asset.slice(0, -3) : asset;
  // Split 6-char forex pair (e.g. AUDUSD → AUD/USD)
  const clean = base.toUpperCase().replace(/[^A-Z]/g, '');
  const formatted = clean.length >= 6
    ? `${clean.slice(0, 3)}/${clean.slice(3)}`
    : clean;
  return isOtc ? `${formatted} OTC` : formatted;
};

const ChartContainer = ({ onChartReady, onError, selectedAsset, showWatermark }) => {
  const chartContainerRef = useRef(null);
  const isDisposedRef = useRef(false);
  const watermarkRef = useRef(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    isDisposedRef.current = false;

    let chart;
    let series;

    try {
      chart = createChart(chartContainerRef.current, {
        layout: {
          background: { color: '#111827' }, // gray-900
          textColor: '#9CA3AF', // gray-400
        },
        grid: {
          vertLines: { color: '#374151' }, // gray-700
          horzLines: { color: '#374151' },
        },
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
        },
        width: chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight,
      });

      const priceFormatter = (price) => formatPriceValue(price);
      series = chart.addSeries(CandlestickSeries, {
        upColor: '#22c55e', // green-500
        downColor: '#ef4444', // red-500
        borderVisible: false,
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
        priceFormat: {
          type: 'custom',
          minMove: 0.00000001,
          formatter: priceFormatter,
        },
      });

      // Initialize with empty data
      series.setData([]);

      // --- Watermark ---
      try {
        const firstPane = chart.panes()[0];
        if (firstPane) {
          const assetLabel = formatAssetLabel(selectedAsset);
          const visible = showWatermark !== false && Boolean(assetLabel);
          watermarkRef.current = createTextWatermark(firstPane, {
            horzAlign: 'center',
            vertAlign: 'center',
            lines: [
              {
                text: assetLabel || '',
                color: 'rgba(156, 163, 175, 0.12)', // gray-400 very faint
                fontSize: 52,
                fontStyle: 'bold',
                fontFamily: 'Inter, system-ui, sans-serif',
              },
            ],
            visible,
          });
        }
      } catch (wmErr) {
        // Watermark is cosmetic — log but do not surface to user
        console.warn('Watermark init failed:', wmErr);
      }

      // Pass chart and series back to parent
      if (onChartReady) {
        onChartReady({ chart, series });
      }

      const resizeObserver = new ResizeObserver((entries) => {
        if (isDisposedRef.current || !chart) return;
        if (entries.length === 0 || !entries[0].contentRect) return;
        const { width, height } = entries[0].contentRect;
        try {
          chart.applyOptions({ width, height });
        } catch (err) {
          if (!isDisposedRef.current) {
            console.error('Chart resize failed', err);
            if (onError) {
              const msg = err instanceof Error ? err.message : String(err);
              onError(`Chart resize failed: ${msg}`);
            }
          }
        }
      });

      resizeObserver.observe(chartContainerRef.current);

      return () => {
        isDisposedRef.current = true;
        watermarkRef.current = null;
        resizeObserver.disconnect();
        try {
          chart.remove();
        } catch (err) {
          console.error('Chart dispose failed', err);
        }
      };
    } catch (err) {
      console.error("Critical error initializing chart:", err);
      if (onError) {
        const msg = err instanceof Error ? err.message : String(err);
        onError(`Chart failed to initialize: ${msg}`);
      }
    }
  }, [onChartReady, onError]); // eslint-disable-line react-hooks/exhaustive-deps
  // Note: selectedAsset/showWatermark are handled by the separate effect below.

  // --- React to watermark setting / asset changes without re-creating the chart ---
  useEffect(() => {
    const wm = watermarkRef.current;
    if (!wm) return;
    try {
      const assetLabel = formatAssetLabel(selectedAsset);
      const visible = showWatermark !== false && Boolean(assetLabel);
      wm.applyOptions({
        visible,
        lines: [
          {
            text: assetLabel || '',
            color: 'rgba(156, 163, 175, 0.12)',
            fontSize: 52,
            fontStyle: 'bold',
            fontFamily: 'Inter, system-ui, sans-serif',
          },
        ],
      });
    } catch (err) {
      console.warn('Watermark update failed:', err);
    }
  }, [selectedAsset, showWatermark]);

  return <div ref={chartContainerRef} className="w-full h-full" />;
};

export default ChartContainer;
