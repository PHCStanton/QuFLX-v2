import { useEffect, useRef } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';

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

const ChartContainer = ({ onChartReady, onError }) => {
  const chartContainerRef = useRef(null);
  const isDisposedRef = useRef(false);

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
  }, [onChartReady, onError]);

  return <div ref={chartContainerRef} className="w-full h-full" />;
};

export default ChartContainer;
