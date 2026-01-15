import { useEffect, useRef, useState } from 'react';

const normalizeEpochSeconds = (value) => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  const seconds = numeric > 10000000000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
  return Number.isFinite(seconds) ? seconds : null;
};

const useTickAggregation = ({
  marketData,
  selectedAssetKey,
  selectedTimeframe,
  candleSeries,
  historyCandles,
  historyStatus,
  selectedAsset,
  onNewCandle,
  onError,
  enableStreaming = true
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const currentCandleRef = useRef(null);

  // Cleanup on Asset Change
  useEffect(() => {
    if (candleSeries) {
      console.log(`Asset changed to: ${selectedAsset}, clearing chart`);
      candleSeries.setData([]); // Clear data
      currentCandleRef.current = null; // Reset current candle ref
      setIsLoading(true); // Show loading state while waiting for new data
    }
  }, [selectedAsset, candleSeries]);

  // Load Historical Data
  useEffect(() => {
    if (!candleSeries || !selectedAsset) return;

    const status = historyStatus && selectedAsset ? historyStatus[selectedAsset] : undefined;
    const candles = historyCandles && selectedAsset ? historyCandles[selectedAsset] : undefined;
    
    // If no candles yet, check status
    if (!Array.isArray(candles)) return;

    if (candles.length === 0) {
      if (['loaded', 'empty', 'not_found', 'error'].includes(status)) {
        setIsLoading(false);
      }
      return;
    }

    const mapped = candles
      .map((c) => {
        if (!c) return null;
        const ts = c.time !== undefined ? c.time : c.timestamp;
        const time = normalizeEpochSeconds(ts);
        if (time == null || time <= 0) return null;
        const open = Number(c.open);
        const high = Number(c.high);
        const low = Number(c.low);
        const close = Number(c.close);
        if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
          return null;
        }
        return {
          time,
          open,
          high,
          low,
          close
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.time - b.time);

    if (mapped.length === 0) {
      setIsLoading(false);
      return;
    }

    // Defensive: If currentRef already exists and is NEWER than history, 
    // it means ticks arrived first. We should ideally merge.
    // For simplicity with Lightweight Charts, we'll use setData for the bulk load.
    candleSeries.setData(mapped);
    
    // Update local ref to the latest candle from history IF it's newer than what we have
    const latestHist = mapped[mapped.length - 1];
    if (!currentCandleRef.current || latestHist.time > currentCandleRef.current.time) {
        currentCandleRef.current = latestHist;
    }
    
    setIsLoading(false);
  }, [historyCandles, historyStatus, selectedAsset, candleSeries]);

  // Handle Tick Aggregation
  useEffect(() => {
    if (!enableStreaming) return;
    const seriesTicks = marketData[selectedAssetKey];
    if (!Array.isArray(seriesTicks) || seriesTicks.length === 0 || !candleSeries) return;

    const latestData = seriesTicks[seriesTicks.length - 1];

    try {
      // If it's a tick-shaped payload (our live market_data path)
      if (latestData && latestData.price !== undefined && latestData.open === undefined) {
        const price = Number(latestData.price);
        const time = normalizeEpochSeconds(latestData.timestamp);
        if (time == null || !Number.isFinite(price)) {
          return;
        }
        
        // Map selectedTimeframe to seconds
        const timeframeMap = {
          ticks: 0,
          '15s': 15,
          '1m': 60,
          '5m': 300,
          '15m': 900,
          '30m': 1800,
          '1h': 3600,
          '4h': 14400,
        };

        const rawInterval = timeframeMap[selectedTimeframe];
        const interval = rawInterval && rawInterval > 0 ? rawInterval : 60;
        
        const candleTime = Math.floor(time / interval) * interval;
        
        let candle = currentCandleRef.current;

        // Prevent updating past candles (if out of order tick comes in)
        if (candle && typeof candle.time === 'number' && candleTime < candle.time && candleTime !== candle.time) {
          return;
        }

        // Check if we are in a new bucket
        if (!candle || candle.time !== candleTime) {
          // If it's a new bucket and we had a previous candle, it means the previous one just finished
          if (candle && onNewCandle) {
            onNewCandle(candle); // Pass the finished candle
          }

          // Start new candle
          candle = {
            time: candleTime,
            open: price,
            high: price,
            low: price,
            close: price
          };
        } else {
          // Update existing candle
          candle.close = price;
          candle.high = Math.max(candle.high, price);
          candle.low = Math.min(candle.low, price);
        }

        currentCandleRef.current = candle;
        candleSeries.update(candle);
      } 
      // If it's a candle (fallback support if marketData ever stores candles)
      else if (latestData && latestData.open !== undefined) {
         const candleData = { ...latestData };
         
         if (candleData.time === undefined && candleData.timestamp !== undefined) {
             candleData.time = Math.floor(candleData.timestamp);
         }
         
         if (typeof candleData.time === 'string') {
             const date = new Date(candleData.time);
             if (!isNaN(date.getTime())) {
                 candleData.time = Math.floor(date.getTime() / 1000);
             }
         }
         
         if (candleData.time != null) {
           candleSeries.update(candleData);
           currentCandleRef.current = candleData;
         }
      }
    } catch (err) {
      console.error("Error updating chart data:", err);
      if (onError) {
        const msg = err instanceof Error ? err.message : String(err);
        onError(`Chart update error: ${msg}`);
      }
    }

    // Hide loading state once we receive first data for this asset
    // We do this AFTER processing to ensure data is actually updating
    setIsLoading(false);
  }, [
    marketData,
    selectedAssetKey,
    selectedTimeframe,
    candleSeries,
    enableStreaming,
    onNewCandle,
    onError
  ]);

  return { isLoading, setIsLoading, currentCandleRef };
};

export default useTickAggregation;
