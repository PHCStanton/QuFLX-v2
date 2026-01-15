import { useCallback, useRef } from 'react';

const getErrorMessage = (err) => {
  if (err instanceof Error) return err.message;
  return String(err);
};

const useCrosshairSync = ({ mainChart, candleSeries, onError }) => {
  const lastMainCrosshairTimeRef = useRef(null);

  const handleCrosshairTimeFromOscillator = useCallback(
    (time) => {
      if (!mainChart || !candleSeries || !time) {
        return;
      }

      const lastTime = lastMainCrosshairTimeRef.current;
      const numericLast = lastTime != null ? Number(lastTime) : null;
      const numericNext = Number(time);

      if (
        numericLast != null &&
        !Number.isNaN(numericLast) &&
        !Number.isNaN(numericNext) &&
        numericLast === numericNext
      ) {
        return;
      }

      lastMainCrosshairTimeRef.current = time;

      try {
        mainChart.setCrosshairPosition(0, time, candleSeries);
      } catch (err) {
        if (onError) onError(`Crosshair sync failed: ${getErrorMessage(err)}`);
      }
    },
    [mainChart, candleSeries, onError]
  );

  return { handleCrosshairTimeFromOscillator };
};

export default useCrosshairSync;
