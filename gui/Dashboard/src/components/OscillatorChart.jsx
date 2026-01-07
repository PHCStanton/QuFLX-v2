import { useEffect, useRef } from 'react';
import { createChart, LineSeries, HistogramSeries, LineStyle } from 'lightweight-charts';

const OscillatorChart = ({
  mainChart,
  data,
  type,
  title,
  params,
  indicatorValue
}) => {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const syncSubscriptionRef = useRef(null);
  const priceLinesRef = useRef([]);

  useEffect(() => {
    if (!containerRef.current) return;

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

    if (type === 'histogram') {
      series = chart.addSeries(HistogramSeries, {
        color: '#22c55e'
      });
    } else {
      series = chart.addSeries(LineSeries, {
        color: isCCI ? '#facc15' : '#22c55e', // yellow-400 for CCI
        lineWidth: 1.5
      });
    }

    // Add Levels
    if (params && params.overbought !== undefined && params.oversold !== undefined) {
      const obLine = series.createPriceLine({
        price: params.overbought,
        color: isRSI ? '#ef4444' : '#facc15', // Red for RSI, Yellow for CCI
        lineWidth: 1,
        lineStyle: isRSI ? LineStyle.Dotted : LineStyle.Solid,
        axisLabelVisible: true,
        title: 'OB',
      });
      const osLine = series.createPriceLine({
        price: params.oversold,
        color: isRSI ? '#3b82f6' : '#facc15', // Blue for RSI, Yellow for CCI
        lineWidth: 1,
        lineStyle: isRSI ? LineStyle.Dotted : LineStyle.Solid,
        axisLabelVisible: true,
        title: 'OS',
      });
      priceLinesRef.current = [obLine, osLine];
    }

    chartRef.current = chart;
    seriesRef.current = series;

    const resizeObserver = new ResizeObserver((entries) => {
      if (entries.length === 0 || !entries[0].contentRect) return;
      const { width, height } = entries[0].contentRect;
      chart.applyOptions({ width, height });
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
      }
      chartRef.current = null;
      seriesRef.current = null;
      syncSubscriptionRef.current = null;
      priceLinesRef.current = [];
    };
  }, [type, params, indicatorValue]);

  useEffect(() => {
    if (!mainChart || !chartRef.current || !mainChart.timeScale) {
      return;
    }

    const mainTimeScale = mainChart.timeScale();
    const oscTimeScale = chartRef.current.timeScale();

    const sync = (range) => {
      if (!range || range.from == null || range.to == null) {
        return;
      }
      try {
        oscTimeScale.setVisibleRange(range);
      } catch (err) {
        console.error('Failed to sync oscillator time scale', err);
      }
    };

    mainTimeScale.subscribeVisibleTimeRangeChange(sync);
    
    // Trigger initial sync after a short delay to ensure both charts are ready
    const timeoutId = setTimeout(() => {
      sync(mainTimeScale.getVisibleRange());
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
  }, [mainChart]);

  useEffect(() => {
    if (!seriesRef.current) return;
    if (!Array.isArray(data) || data.length === 0) {
      seriesRef.current.setData([]);
      return;
    }
    const cleaned = data.filter((point) => point && point.time != null && point.value != null);

    if (cleaned.length === 0) {
      seriesRef.current.setData([]);
      return;
    }

    const sorted = [...cleaned].sort((a, b) => {
      const ta = typeof a.time === 'string' ? Number(a.time) : a.time;
      const tb = typeof b.time === 'string' ? Number(b.time) : b.time;
      if (ta == null || tb == null) return 0;
      return ta - tb;
    });

    seriesRef.current.setData(sorted);
  }, [data]);

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
