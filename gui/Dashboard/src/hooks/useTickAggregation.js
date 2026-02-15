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
  volumeSeries, // New prop
  historyCandles,
  historyStatus,
  selectedAsset,
  onNewCandle,
  onError,
  enableStreaming = true
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const currentCandleRef = useRef(null);
  const currentVolumeRef = useRef(0); // Track volume accumulation

  // Cleanup on Asset Change
  useEffect(() => {
    if (candleSeries) {
      console.log(`Asset changed to: ${selectedAsset}, clearing chart`);
      candleSeries.setData([]);
      if (volumeSeries) volumeSeries.setData([]); // Clear volume
      currentCandleRef.current = null;
      currentVolumeRef.current = 0;
      setIsLoading(true);
    }
  }, [selectedAsset, candleSeries, volumeSeries]);

  // Load Historical Data
  useEffect(() => {
    if (!candleSeries || !selectedAsset) return;

    const status = historyStatus && selectedAsset ? historyStatus[selectedAsset] : undefined;
    const candles = historyCandles && selectedAsset ? historyCandles[selectedAsset] : undefined;

    if (!Array.isArray(candles)) return;

    if (candles.length === 0) {
      if (['loaded', 'empty', 'not_found', 'error'].includes(status)) {
        setIsLoading(false);
      }
      return;
    }

    const mappedCandles = [];
    const mappedVolume = [];

    candles.forEach((c) => {
      if (!c) return;
      const ts = c.time !== undefined ? c.time : c.timestamp;
      const time = normalizeEpochSeconds(ts);
      if (time == null || time <= 0) return;

      const open = Number(c.open);
      const high = Number(c.high);
      const low = Number(c.low);
      const close = Number(c.close);

      if (!Number.isFinite(open)) return;

      mappedCandles.push({ time, open, high, low, close });

      if (volumeSeries) {
        const vol = Number(c.volume || c.tick_volume || 0); // Handle historical volume if present
        const color = close >= open ? 'rgba(38, 166, 153, 0.5)' : 'rgba(239, 83, 80, 0.5)';
        mappedVolume.push({ time, value: vol, color });
      }
    });

    mappedCandles.sort((a, b) => a.time - b.time);
    mappedVolume.sort((a, b) => a.time - b.time);

    if (mappedCandles.length === 0) {
      setIsLoading(false);
      return;
    }

    candleSeries.setData(mappedCandles);
    if (volumeSeries) volumeSeries.setData(mappedVolume);

    // Update local ref
    const latestHist = mappedCandles[mappedCandles.length - 1];
    if (!currentCandleRef.current || latestHist.time > currentCandleRef.current.time) {
      currentCandleRef.current = latestHist;
      // Sync volume ref
      const latestVol = mappedVolume[mappedVolume.length - 1];
      currentVolumeRef.current = latestVol ? latestVol.value : 0;
    }

    setIsLoading(false);
  }, [historyCandles, historyStatus, selectedAsset, candleSeries, volumeSeries]);

  // Handle Tick Aggregation
  useEffect(() => {
    if (!enableStreaming) return;
    const seriesTicks = marketData[selectedAssetKey];
    if (!Array.isArray(seriesTicks) || seriesTicks.length === 0 || !candleSeries) return;

    const latestData = seriesTicks[seriesTicks.length - 1];

    try {
      if (latestData && latestData.price !== undefined && latestData.open === undefined) {
        const price = Number(latestData.price);
        const time = normalizeEpochSeconds(latestData.timestamp);
        if (time == null || !Number.isFinite(price)) return;

        const timeframeMap = {
          ticks: 0, '15s': 15, '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400,
        };
        const rawInterval = timeframeMap[selectedTimeframe];
        const interval = rawInterval && rawInterval > 0 ? rawInterval : 60;

        const candleTime = Math.floor(time / interval) * interval;

        let candle = currentCandleRef.current;

        // SKIP update if tick is OLDER than current candle
        if (candle && typeof candle.time === 'number' && candleTime < candle.time) return;

        // NEW CANDLE
        if (!candle || candle.time !== candleTime) {
          if (candle && onNewCandle) onNewCandle(candle);

          candle = { time: candleTime, open: price, high: price, low: price, close: price };
          currentVolumeRef.current = 1; // Reset volume count
        } else {
          // UPDATE CANDLE
          candle.close = price;
          candle.high = Math.max(candle.high, price);
          candle.low = Math.min(candle.low, price);
          currentVolumeRef.current += 1; // Increment tick volume
        }

        currentCandleRef.current = candle;
        candleSeries.update(candle);

        if (volumeSeries) {
          const color = candle.close >= candle.open ? 'rgba(38, 166, 153, 0.25)' : 'rgba(239, 83, 80, 0.25)';
          volumeSeries.update({
            time: candleTime,
            value: currentVolumeRef.current,
            color
          });
        }

      } else if (latestData && latestData.open !== undefined) {
        // Fallback for full candle updates from backend (uncommon for ticks path)
        // ... (Keep existing fallbacks if needed, simplified here)
      }
    } catch (err) {
      console.error("Error updating chart data:", err);
      if (onError) onError(`Chart update error: ${err.message}`);
    }

    setIsLoading(false);
  }, [
    marketData, selectedAssetKey, selectedTimeframe, candleSeries, volumeSeries, enableStreaming, onNewCandle, onError
  ]);

  return { isLoading, setIsLoading, currentCandleRef };
};

export default useTickAggregation;
