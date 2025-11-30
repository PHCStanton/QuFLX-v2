import React, { useEffect, useRef } from 'react';
import Card from './Card';
import Combobox from './Combobox';
import { Bot, X, Layers, Clock, FileText } from 'lucide-react';
import useMarketStore from '../store/marketStore';
import { createChart, CandlestickSeries } from 'lightweight-charts';

const ChartWorkspace = () => {
  const { 
    selectedAsset, setSelectedAsset,
    selectedTimeframe, setSelectedTimeframe,
    payoutAssets,
    marketData, // Get live data
    activeIndicators, removeIndicator, addIndicator
  } = useMarketStore();

  const chartContainerRef = useRef(null);
  const candleSeriesRef = useRef(null);

  // Initialize Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    let chart;
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
        width: chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight,
      });

      if (!chart) {
        console.error("Chart creation failed: chart object is null/undefined");
        return;
      }

      // v5 API: Use addSeries with CandlestickSeries type
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#22c55e', // green-500
        downColor: '#ef4444', // red-500
        borderVisible: false,
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
      });
      
      candleSeriesRef.current = candleSeries;

      // Mock Data
      const data = [
        { time: '2018-12-22', open: 75.16, high: 82.84, low: 36.16, close: 45.72 },
        { time: '2018-12-23', open: 45.12, high: 53.90, low: 45.12, close: 48.09 },
        { time: '2018-12-24', open: 60.71, high: 60.71, low: 53.39, close: 59.29 },
        { time: '2018-12-25', open: 68.26, high: 68.26, low: 59.04, close: 60.50 },
        { time: '2018-12-26', open: 67.71, high: 105.85, low: 66.67, close: 91.04 },
        { time: '2018-12-27', open: 91.04, high: 121.40, low: 82.70, close: 111.40 },
        { time: '2018-12-28', open: 111.51, high: 142.83, low: 103.34, close: 131.25 },
        { time: '2018-12-29', open: 131.33, high: 151.17, low: 77.68, close: 96.43 },
        { time: '2018-12-30', open: 106.33, high: 110.20, low: 90.39, close: 98.10 },
        { time: '2018-12-31', open: 109.87, high: 114.69, low: 85.66, close: 111.26 },
      ];

      candleSeries.setData(data);

      const handleResize = () => {
        if (chartContainerRef.current) {
          chart.applyOptions({ width: chartContainerRef.current.clientWidth });
        }
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        chart.remove();
        candleSeriesRef.current = null;
      };
    } catch (err) {
      console.error("Critical error initializing chart:", err);
    }
  }, []);

  // Handle Live Updates (Frontend Aggregation)
  useEffect(() => {
    const latestData = marketData[selectedAsset];
    if (latestData && candleSeriesRef.current) {
      try {
        // Check if it's a tick (has price but no open/close)
        if (latestData.price !== undefined && latestData.open === undefined) {
          const tick = latestData;
          const price = tick.price;
          const timestamp = tick.timestamp; // Unix timestamp (seconds or ms)
          
          // Convert to seconds if in ms
          const time = timestamp > 10000000000 ? Math.floor(timestamp / 1000) : Math.floor(timestamp);
          
          // Get current candle from series
          // Note: lightweight-charts doesn't give easy access to the *last* candle data directly from the series object
          // without maintaining state. However, we can use update() with the same time to update the current candle.
          
          // We need to maintain the current candle state locally or in the store to aggregate correctly.
          // For simplicity, let's assume we are starting a new candle if time changes significantly,
          // or updating the existing one.
          
          // Since we don't have the previous candle state easily here without a ref, 
          // we'll implement a simple heuristic:
          // If the chart has data, we assume the last point is the current candle.
          // But we can't read it back easily.
          
          // BETTER APPROACH: The store should probably handle aggregation or we keep a local ref.
          // Let's use a local ref for the current candle.
        } else {
          // It's a full candle update (from history or backend aggregation)
          candleSeriesRef.current.update(latestData);
        }
      } catch (err) {
        console.error("Error updating chart:", err);
      }
    }
  }, [marketData, selectedAsset]);

  // Ref to store the current building candle
  const currentCandleRef = useRef(null);

  // Effect to handle tick aggregation
  useEffect(() => {
    const latestData = marketData[selectedAsset];
    if (!latestData || !candleSeriesRef.current) return;

    // If it's a tick
    if (latestData.price !== undefined && latestData.open === undefined) {
      const price = latestData.price;
      const timestamp = latestData.timestamp;
      const time = timestamp > 10000000000 ? Math.floor(timestamp / 1000) : Math.floor(timestamp);
      
      // Determine timeframe interval (e.g., 60s for 1m)
      // TODO: Map selectedTimeframe to seconds. Defaulting to 60s.
      const interval = 60; 
      const candleTime = Math.floor(time / interval) * interval;

      let candle = currentCandleRef.current;

      if (!candle || candle.time !== candleTime) {
        // Start new candle
        // If we have a previous candle, ensure it's closed? 
        // Lightweight charts handles updates automatically.
        
        // Initialize new candle
        candle = {
          time: candleTime,
          open: price,
          high: price,
          low: price,
          close: price,
        };
      } else {
        // Update existing candle
        candle.close = price;
        candle.high = Math.max(candle.high, price);
        candle.low = Math.min(candle.low, price);
      }

      currentCandleRef.current = candle;
      candleSeriesRef.current.update(candle);
    } 
    // If it's a candle (e.g. historical data loaded)
    else if (latestData.open !== undefined) {
       candleSeriesRef.current.update(latestData);
       // Update our ref so next tick continues correctly
       currentCandleRef.current = latestData;
    }
  }, [marketData, selectedAsset, selectedTimeframe]);

  // Options for Comboboxes
  const assetOptions = payoutAssets.map(a => ({ label: a, value: a }));
  
  const timeframeOptions = [
    { label: 'Ticks', value: 'ticks' },
    { label: '1 Minute', value: '1m' },
    { label: '5 Minutes', value: '5m' },
    { label: '15 Minutes', value: '15m' },
    { label: '1 Hour', value: '1h' },
  ];

  const csvOptions = [
    { label: 'Upload New...', value: 'upload' },
    { label: 'AUDNZD_2023.csv', value: 'file1' },
  ];

  const indicatorOptions = [
    { label: 'RSI', value: 'rsi' },
    { label: 'MACD', value: 'macd' },
    { label: 'Bollinger Bands', value: 'bb' },
  ];

  // Logic to disable Ticks/Candles based on selection
  // Note: In a real app, this might depend on available data for the asset
  // For now, we'll just ensure the UI reflects the selection
  const handleTimeframeChange = (val) => {
    setSelectedTimeframe(val);
  };

  return (
    <div className="col-span-9 flex flex-col gap-4 flex-1">
      
      {/* Top Bar - Selectors */}
      <Card className="p-3 rounded-lg flex flex-wrap items-center gap-3 z-20">
        
        <div className="w-40">
          <Combobox 
            label="Asset" 
            value={selectedAsset} 
            onChange={setSelectedAsset} 
            options={assetOptions} 
          />
        </div>

        <div className="w-32">
          <Combobox 
            label="Timeframe" 
            value={selectedTimeframe} 
            onChange={handleTimeframeChange} 
            options={timeframeOptions}
            icon={Clock}
          />
        </div>

        <div className="w-40">
          <Combobox 
            label="Import" 
            placeholder="Select CSV..."
            options={csvOptions}
            onChange={() => {}}
            icon={FileText}
          />
        </div>

        <div className="w-40">
          <Combobox 
            label="Indicators" 
            placeholder="Add Indicator..."
            options={indicatorOptions}
            onChange={(val) => {
              const label = indicatorOptions.find(o => o.value === val)?.label;
              addIndicator({ id: val + Date.now(), name: label, value: 'Default' });
            }}
            icon={Layers}
          />
        </div>

        <div className="flex-1"></div>

        <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 rounded text-sm font-bold transition-all shadow-lg shadow-indigo-500/20">
          <Bot size={18} />
          <span>Ask AI</span>
        </button>
      </Card>

      {/* Active Indicators List */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {activeIndicators.map((ind) => (
          <IndicatorBadge 
            key={ind.id} 
            name={ind.name} 
            value={ind.value} 
            onRemove={() => removeIndicator(ind.id)} 
          />
        ))}
      </div>

      {/* Chart Display */}
      <Card className="flex-1 p-0 rounded-lg relative overflow-hidden flex flex-col min-h-[400px]">
        <div className="absolute top-4 right-4 z-10 flex gap-2">
          <span className="bg-black/50 backdrop-blur px-2 py-1 rounded text-xs text-gray-300">Live Feed</span>
        </div>
        
        <div ref={chartContainerRef} className="w-full h-full"></div>
      </Card>
    </div>
  );
};

const IndicatorBadge = ({ name, value, onRemove }) => (
  <div className="flex items-center gap-2 px-2 py-1 bg-gray-800 rounded border border-gray-700 text-xs whitespace-nowrap">
    <span className="text-accent-green font-bold">{name}</span>
    <span className="text-gray-400">{value}</span>
    <X size={12} className="cursor-pointer hover:text-red-400" onClick={onRemove} />
  </div>
);

export default ChartWorkspace;
