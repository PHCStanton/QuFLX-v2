import { useEffect, useRef } from 'react';
import { createChart, LineSeries, HistogramSeries } from 'lightweight-charts';

const OscillatorChart = ({
  mainChart,
  data,
  type,
  title
}) => {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const syncSubscriptionRef = useRef(null);

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
    if (type === 'histogram') {
      series = chart.addSeries(HistogramSeries, {
        color: '#22c55e'
      });
    } else {
      series = chart.addSeries(LineSeries, {
        color: '#22c55e',
        lineWidth: 1
      });
    }

    chartRef.current = chart;
    seriesRef.current = series;

    if (mainChart && mainChart.timeScale) {
      const mainTimeScale = mainChart.timeScale();
      const oscTimeScale = chart.timeScale();

      const sync = (range) => {
        if (!range) return;
        oscTimeScale.setVisibleRange(range);
      };

      mainTimeScale.subscribeVisibleTimeRangeChange(sync);
      syncSubscriptionRef.current = { mainTimeScale, sync };
    }

    return () => {
      if (syncSubscriptionRef.current) {
        const { mainTimeScale, sync } = syncSubscriptionRef.current;
        if (mainTimeScale && sync) {
          mainTimeScale.unsubscribeVisibleTimeRangeChange(sync);
        }
      }

      if (chartRef.current) {
        chartRef.current.remove();
      }
      chartRef.current = null;
      seriesRef.current = null;
      syncSubscriptionRef.current = null;
    };
  }, [mainChart, type]);

  useEffect(() => {
    if (!seriesRef.current) return;
    if (!Array.isArray(data) || data.length === 0) {
      seriesRef.current.setData([]);
      return;
    }
    seriesRef.current.setData(data);
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
