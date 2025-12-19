import React, { useEffect, useRef } from 'react';
import Card from './Card';
import Combobox from './Combobox';
import { Bot, X, Layers, Clock, FileText } from 'lucide-react';
import useMarketStore from '../store/marketStore';
import { createChart, CandlestickSeries } from 'lightweight-charts';

const ChartWorkspace = () => {
  const { 
    selectedAsset, setSelectedAsset,
    selectedAssetKey,
    selectedTimeframe, setSelectedTimeframe,
    payoutAssets,
    marketData, // Get live data
    historyCandles,
    historyStatus,
    activeIndicators, removeIndicator, addIndicator,
    lastError, clearError
  } = useMarketStore();

  const chartContainerRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const [isLoading, setIsLoading] = React.useState(false);

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
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
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
      
      // Initialize with empty data - data comes from Socket.IO
      candleSeries.setData([]);

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

  // Ref to store the current building candle
  const currentCandleRef = useRef(null);

  // Cleanup on Asset Change
  useEffect(() => {
    if (candleSeriesRef.current) {
      console.log(`Asset changed to: ${selectedAsset}, clearing chart`);
      candleSeriesRef.current.setData([]); // Clear data
      currentCandleRef.current = null; // Reset current candle ref
      setIsLoading(true); // Show loading state while waiting for new data
    }
  }, [selectedAsset]);

  useEffect(() => {
    if (!candleSeriesRef.current || !selectedAsset) return;

    const status = historyStatus?.[selectedAsset];
    const candles = historyCandles?.[selectedAsset];
    if (!Array.isArray(candles)) return;

    if (candles.length === 0) {
      if (status === 'loaded' || status === 'empty' || status === 'not_found' || status === 'error') {
        setIsLoading(false);
      }
      return;
    }

    const mapped = candles
      .map((c) => {
        const ts = c.time !== undefined ? c.time : c.timestamp;
        const time = ts > 10000000000 ? Math.floor(ts / 1000) : Math.floor(ts);
        return {
          time,
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
        };
      })
      .filter((c) => Number.isFinite(c.time) && Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close))
      .sort((a, b) => a.time - b.time);

    if (mapped.length === 0) {
      setIsLoading(false);
      return;
    }

    candleSeriesRef.current.setData(mapped);
    currentCandleRef.current = mapped[mapped.length - 1];
    setIsLoading(false);
  }, [historyCandles, historyStatus, selectedAsset]);

  // Effect to handle tick aggregation
  useEffect(() => {
    const latestData = marketData[selectedAssetKey];
    if (!latestData || !candleSeriesRef.current) return;

    // Hide loading state once we receive first data for this asset
    if (isLoading) {
      setIsLoading(false);
    }

    try {
      // Validate data belongs to selected asset
      if (latestData.asset && latestData.asset !== selectedAssetKey) {
        console.warn(`Data asset mismatch: expected ${selectedAssetKey}, got ${latestData.asset}`);
        return;
      }

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

        if (candle && typeof candle.time === 'number' && candleTime < candle.time && candleTime !== candle.time) {
          return;
        }

        // Check if we are in a new bucket
        if (!candle || candle.time !== candleTime) {
          // Start new candle
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
         const candleData = { ...latestData };
         
         // Map timestamp to time if needed (Pydantic model uses timestamp)
         if (candleData.time === undefined && candleData.timestamp !== undefined) {
             candleData.time = Math.floor(candleData.timestamp);
         }
         
         // Ensure time is a UNIX timestamp for intraday
         if (typeof candleData.time === 'string') {
             const date = new Date(candleData.time);
             if (!isNaN(date.getTime())) {
                 candleData.time = Math.floor(date.getTime() / 1000);
             }
         }
         
         candleSeriesRef.current.update(candleData);
         // Update our ref so next tick continues correctly
         currentCandleRef.current = candleData;
      }
    } catch (err) {
      console.error("Error updating chart data:", err);
    }
  }, [marketData, selectedAssetKey, selectedTimeframe, isLoading]);

  // Options for Comboboxes
  const assetList = Array.from(new Set([...(payoutAssets || []), selectedAsset].filter(Boolean)));
  const assetOptions = assetList.map(a => ({ label: a, value: a }));
  
  const timeframeOptions = [
    { label: '1 Minute (Locked)', value: '1m' },
  ];

  /*
  // Restore full options when mapping is complete
  const timeframeOptions = [
    { label: 'Ticks', value: 'ticks' },
    { label: '1 Minute', value: '1m' },
    { label: '5 Minutes', value: '5m' },
    { label: '15 Minutes', value: '15m' },
    { label: '1 Hour', value: '1h' },
  ];
  */

  const csvOptions = [
    { label: 'Upload New...', value: 'upload' },
    { label: 'AUDNZD_2023.csv', value: 'file1' },
  ];

  const indicatorOptions = [
    { label: 'RSI', value: 'rsi' },
    { label: 'MACD', value: 'macd' },
    { label: 'Bollinger Bands', value: 'bb' },
  ];

  const handleTimeframeChange = (val) => {
    setIsLoading(true);
    setSelectedTimeframe(val).then(() => {
      // Note: loading state is cleared when new data arrives or timeout
      setTimeout(() => setIsLoading(false), 3000); // Timeout after 3s
    }).catch((err) => {
      console.error("Timeframe change failed:", err);
      setIsLoading(false);
    });
  };

  return (
    <Card className="col-span-9 flex flex-col flex-1 overflow-hidden rounded-lg bg-gray-900 border border-gray-800 shadow-xl relative">
      
      {/* Error Message Display */}
      {lastError && (
        <div className="p-2 bg-red-900/50 border-b border-red-600 text-red-200 text-xs flex justify-between items-center z-50">
          <span>{lastError}</span>
          <button onClick={clearError} className="text-red-300 hover:text-red-100">✕</button>
        </div>
      )}
      
      {/* Unified Top Bar - Compact Controls */}
      <div className="p-1.5 border-b border-gray-700 bg-gray-800/90 flex flex-wrap items-center gap-2 z-40 backdrop-blur-sm">
        
        <div className="w-36">
          <Combobox 
            label="Asset" 
            value={selectedAsset} 
            onChange={setSelectedAsset} 
            options={assetOptions} 
          />
        </div>

        <div className="w-28">
          <Combobox 
            label="Time" 
            value={selectedTimeframe} 
            onChange={handleTimeframeChange} 
            options={timeframeOptions}
            icon={Clock}
          />
        </div>

        <div className="w-32">
          <Combobox 
            label="Import" 
            placeholder="CSV..."
            options={csvOptions}
            onChange={() => {}}
            icon={FileText}
          />
        </div>

        <div className="w-32">
          <Combobox 
            label="Indicators" 
            placeholder="+ Add"
            options={indicatorOptions}
            onChange={(val) => {
              const label = indicatorOptions.find(o => o.value === val)?.label;
              addIndicator({ id: val + Date.now(), name: label, value: 'Default' });
            }}
            icon={Layers}
          />
        </div>

        {/* Active Indicators Inline if space permits, or they wrap */}
        <div className="flex-1 flex gap-2 overflow-x-auto items-center justify-end no-scrollbar px-2">
           {activeIndicators.map((ind) => (
            <IndicatorBadge 
              key={ind.id} 
              name={ind.name} 
              value={ind.value} 
              onRemove={() => removeIndicator(ind.id)} 
            />
          ))}
        </div>
      </div>

      {/* Chart Display Area */}
      <div className="flex-1 relative w-full min-h-0">
        <div className="absolute top-2 right-2 z-10 flex gap-2">
          <span className="bg-black/50 backdrop-blur px-2 py-0.5 rounded text-[10px] uppercase font-bold text-gray-400 border border-gray-800">Live Feed</span>
        </div>
        
        {isLoading && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-20 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-2 border-gray-400 border-t-accent-green rounded-full animate-spin"></div>
              <span className="text-gray-300 text-sm">Loading data for {selectedAsset}...</span>
            </div>
          </div>
        )}
        
        <div ref={chartContainerRef} className="w-full h-full"></div>
      </div>
    </Card>
  );
};

const IndicatorBadge = ({ name, value, onRemove }) => (
  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-800/80 rounded border border-gray-600 text-[10px] whitespace-nowrap shadow-sm">
    <span className="text-accent-green font-bold">{name}</span>
    <span className="text-gray-400">{value}</span>
    <X size={10} className="cursor-pointer hover:text-red-400" onClick={onRemove} />
  </div>
);

export default ChartWorkspace;
