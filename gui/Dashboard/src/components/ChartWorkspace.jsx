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

  // Helper function to convert timestamp to business day object
  const getBusinessDay = (timestamp) => {
    const date = new Date(timestamp > 10000000000 ? timestamp : timestamp * 1000);
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    };
  };

  // Effect to handle tick aggregation
  useEffect(() => {
    const latestData = marketData[selectedAsset];
    if (!latestData || !candleSeriesRef.current) return;

    // Hide loading state once we receive first data for this asset
    if (isLoading) {
      setIsLoading(false);
    }

    try {
      // Validate data belongs to selected asset
      if (latestData.asset && latestData.asset !== selectedAsset) {
        console.warn(`Data asset mismatch: expected ${selectedAsset}, got ${latestData.asset}`);
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
        const candleDate = getBusinessDay(candleTime * 1000);

        let candle = currentCandleRef.current;

        if (!candle || candle.time.year !== candleDate.year || candle.time.month !== candleDate.month || candle.time.day !== candleDate.day) {
          // Start new candle
          candle = {
            time: candleDate,
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
         // Ensure time is in business day format
         const candleData = { ...latestData };
         if (typeof candleData.time === 'string') {
           const [year, month, day] = candleData.time.split('-').map(Number);
           candleData.time = { year, month, day };
         }
         candleSeriesRef.current.update(candleData);
         // Update our ref so next tick continues correctly
         currentCandleRef.current = candleData;
      }
    } catch (err) {
      console.error("Error updating chart data:", err);
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
    <div className="col-span-9 flex flex-col gap-4 flex-1">
      
      {/* Error Message Display */}
      {lastError && (
        <div className="p-3 bg-red-900/50 border border-red-600 rounded text-red-200 text-sm flex justify-between items-center">
          <span>{lastError}</span>
          <button onClick={clearError} className="text-red-300 hover:text-red-100">✕</button>
        </div>
      )}
      
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
        
        {isLoading && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-20 rounded-lg">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-2 border-gray-400 border-t-accent-green rounded-full animate-spin"></div>
              <span className="text-gray-300 text-sm">Loading data for {selectedAsset}...</span>
            </div>
          </div>
        )}
        
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
