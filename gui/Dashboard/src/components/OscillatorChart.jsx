import { useEffect, useRef } from 'react';
import { createChart, LineSeries, HistogramSeries, LineStyle } from 'lightweight-charts';

const OscillatorChart = ({
  mainChart,
  data,
  type,
  title,
  params,
  indicatorValue,
  onError,
}) => {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const syncSubscriptionRef = useRef(null);
  const crosshairSubscriptionRef = useRef(null);
  const priceLinesRef = useRef([]);
  const dataRef = useRef([]);
  const isDisposedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;

    isDisposedRef.current = false;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: '#111827' },
        textColor: '#9CA3AF'
      },
      grid: {
        vertLines: { color: '#1F2937' },
        horzLines: { color: '#1F2937' }
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false
      },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight
    });

    let series;
    const isRSI = indicatorValue === 'rsi' || (title && title.toLowerCase().includes('rsi'));
    const isCCI = indicatorValue === 'cci' || (title && title.toLowerCase().includes('cci'));
    const isATR = indicatorValue === 'atr' || (title && title.toLowerCase().includes('atr'));

    if (type === 'histogram') {
      series = chart.addSeries(HistogramSeries, {
        color: '#22c55e'
      });
    } else {
      series = chart.addSeries(LineSeries, {
        color: isATR ? '#38bdf8' : isCCI ? '#facc15' : '#22c55e',
        lineWidth: 1.5,
        ...(isATR
          ? {
              priceFormat: {
                type: 'custom',
                minMove: 0.00001,
                formatter: (price) => (Number.isFinite(price) ? price.toFixed(5) : ''),
              },
            }
          : {}),
      });
    }

    // Add Levels
    const levels = [];
    if (params && params.overbought !== undefined) {
      const obLine = series.createPriceLine({
        price: params.overbought,
        color: isRSI ? '#ef4444' : '#facc15', // Red for RSI, Yellow for CCI/Others
        lineWidth: 1,
        lineStyle: isRSI ? LineStyle.Dotted : LineStyle.Solid,
        axisLabelVisible: true,
        title: isRSI ? 'OB' : 'Level',
      });
      levels.push(obLine);
    }
    if (params && params.oversold !== undefined) {
      const osLine = series.createPriceLine({
        price: params.oversold,
        color: isRSI ? '#3b82f6' : '#facc15', // Blue for RSI, Yellow for CCI/Others
        lineWidth: 1,
        lineStyle: isRSI ? LineStyle.Dotted : LineStyle.Solid,
        axisLabelVisible: true,
        title: isRSI ? 'OS' : 'Level',
      });
      levels.push(osLine);
    }
    priceLinesRef.current = levels;

    chartRef.current = chart;
    seriesRef.current = series;

    const resizeObserver = new ResizeObserver((entries) => {
      if (isDisposedRef.current || !chartRef.current) return;
      if (entries.length === 0 || !entries[0].contentRect) return;
      const { width, height } = entries[0].contentRect;
      try {
        chartRef.current.applyOptions({ width, height });
      } catch (err) {
        if (!isDisposedRef.current) {
          console.error('Oscillator resize failed', err);
          if (onError) {
            const msg = err instanceof Error ? err.message : String(err);
            onError(`Oscillator resize failed: ${msg}`);
          }
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      isDisposedRef.current = true;
      resizeObserver.disconnect();
      if (chartRef.current) {
        try {
          chartRef.current.remove();
        } catch (err) {
          console.error('Oscillator chart dispose failed', err);
        }
      }
      chartRef.current = null;
      seriesRef.current = null;
      syncSubscriptionRef.current = null;
      crosshairSubscriptionRef.current = null;
      priceLinesRef.current = [];
    };
  }, [type, params, indicatorValue, title, onError]);

  useEffect(() => {
    if (!mainChart || !chartRef.current || !mainChart.timeScale) {
      return;
    }

    const mainTimeScale = mainChart.timeScale();
    const sync = (range) => {
      if (isDisposedRef.current || !chartRef.current) {
        return;
      }
      if (!range || typeof range.from !== 'number' || typeof range.to !== 'number') {
        return;
      }
      if (!Number.isFinite(range.from) || !Number.isFinite(range.to) || range.from >= range.to) {
        return;
      }

      const points = dataRef.current;
      if (!Array.isArray(points) || points.length < 2) {
        return;
      }

      const toNumericTime = (time) => {
        if (typeof time === 'number') return time;
        if (typeof time === 'string') {
          const n = Number(time);
          return Number.isFinite(n) ? n : null;
        }
        return null;
      };

      const firstTime = toNumericTime(points[0]?.time);
      const lastTime = toNumericTime(points[points.length - 1]?.time);
      if (firstTime == null || lastTime == null) {
        return;
      }

      if (range.to < firstTime || range.from > lastTime) {
        return;
      }

      try {
        const oscTimeScale = chartRef.current.timeScale();
        oscTimeScale.setVisibleRange(range);
      } catch (err) {
        console.error('Failed to sync oscillator time scale', err);
        if (onError) {
          const msg = err instanceof Error ? err.message : String(err);
          onError(`Oscillator chart sync failed: ${msg}`);
        }
      }
    };

    mainTimeScale.subscribeVisibleTimeRangeChange(sync);
    
    // Trigger initial sync after a short delay to ensure both charts are ready
    const timeoutId = setTimeout(() => {
      if (isDisposedRef.current) return;
      const range = mainTimeScale.getVisibleRange();
      if (range) {
        sync(range);
      }
    }, 100);

    syncSubscriptionRef.current = { mainTimeScale, sync };

    return () => {
      clearTimeout(timeoutId);
      if (syncSubscriptionRef.current) {
        const { mainTimeScale, sync } = syncSubscriptionRef.current;
        if (mainTimeScale && sync) {
          mainTimeScale.unsubscribeVisibleTimeRangeChange(sync);
        }
      }
      syncSubscriptionRef.current = null;
    };
  }, [mainChart, type, params, indicatorValue, title, onError]);

  useEffect(() => {
    if (!seriesRef.current) return;
    if (!Array.isArray(data) || data.length === 0) {
      seriesRef.current.setData([]);
      dataRef.current = [];
      return;
    }
    const cleaned = data.filter((point) => point && point.time != null && point.value != null);

    if (cleaned.length === 0) {
      seriesRef.current.setData([]);
      dataRef.current = [];
      return;
    }

    const sorted = [...cleaned].sort((a, b) => {
      const ta = typeof a.time === 'string' ? Number(a.time) : a.time;
      const tb = typeof b.time === 'string' ? Number(b.time) : b.time;
      if (ta == null || tb == null) return 0;
      return ta - tb;
    });

    seriesRef.current.setData(sorted);
    dataRef.current = sorted;

    if (syncSubscriptionRef.current) {
      const { mainTimeScale, sync } = syncSubscriptionRef.current;
      const range = mainTimeScale?.getVisibleRange ? mainTimeScale.getVisibleRange() : null;
      if (range) {
        sync(range);
      }
    }
  }, [data]);

  useEffect(() => {
    if (!mainChart || !chartRef.current || !seriesRef.current) {
      return;
    }
    if (!mainChart.subscribeCrosshairMove || !mainChart.unsubscribeCrosshairMove) {
      return;
    }

    const handleCrosshairMove = (param) => {
      if (isDisposedRef.current || !chartRef.current || !seriesRef.current) {
        return;
      }

      if (!param || !param.time) {
        try {
          chartRef.current.clearCrosshairPosition();
        } catch (err) {
          if (!isDisposedRef.current) {
            console.error('Failed to clear oscillator crosshair', err);
          }
        }
        return;
      }

      const toNumericTime = (time) => {
        if (typeof time === 'number') return time;
        if (typeof time === 'string') {
          const n = Number(time);
          return Number.isFinite(n) ? n : null;
        }
        return null;
      };

      const points = dataRef.current;
      if (!Array.isArray(points) || points.length < 2) {
        return;
      }

      const firstTime = toNumericTime(points[0]?.time);
      const lastTime = toNumericTime(points[points.length - 1]?.time);
      const currentTime = toNumericTime(param.time);
      if (firstTime == null || lastTime == null || currentTime == null) {
        return;
      }

      if (currentTime < firstTime || currentTime > lastTime) {
        return;
      }

      let value = 0;

      if (points.length > 0) {
        const time = param.time;
        const match = points.find((point) => {
          if (!point || point.time == null) {
            return false;
          }
          if (point.time === time) {
            return true;
          }
          const pt = Number(point.time);
          const tt = Number(time);
          if (Number.isNaN(pt) || Number.isNaN(tt)) {
            return false;
          }
          return pt === tt;
        });

        if (match && match.value != null) {
          value = match.value;
        } else {
          const last = points[points.length - 1];
          if (last && last.value != null) {
            value = last.value;
          }
        }
      }

      try {
        chartRef.current.setCrosshairPosition(value, param.time, seriesRef.current);
      } catch (err) {
        if (!isDisposedRef.current) {
          console.error('Failed to set oscillator crosshair from main chart', err);
          if (onError) {
            const msg = err instanceof Error ? err.message : String(err);
            onError(`Oscillator crosshair sync failed: ${msg}`);
          }
        }
      }
    };

    mainChart.subscribeCrosshairMove(handleCrosshairMove);
    crosshairSubscriptionRef.current = { mainChart, handleCrosshairMove };

    return () => {
      if (crosshairSubscriptionRef.current) {
        const { mainChart: chart, handleCrosshairMove: handler } = crosshairSubscriptionRef.current;
        if (chart && handler && chart.unsubscribeCrosshairMove) {
          chart.unsubscribeCrosshairMove(handler);
        }
      }
      crosshairSubscriptionRef.current = null;
    };
  }, [mainChart, type, params, indicatorValue, title, onError]);

  return (
    <div className="w-full h-full flex flex-col">
      {title && (
        <div className="text-[10px] text-gray-400 px-2 py-0.5 uppercase tracking-wide">
          {title}
        </div>
      )}
      <div className="flex-1" ref={containerRef} />
    </div>
  );
};

export default OscillatorChart;
