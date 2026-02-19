import { useCallback, useEffect, useRef, useState } from 'react';
import ErrorBoundary from './ErrorBoundary';
import OscillatorChart from './OscillatorChart';

const OscillatorPanel = ({
  mainChart,
  selectedAsset,
  selectedTimeframe,
  seriesKey: seriesKeyProp,
  oscillatorIndicators,
  indicatorSeries,
  indicatorStatus,
  onError
}) => {
  const [oscillatorHeight, setOscillatorHeight] = useState(200);
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef(null);

  const handleDragStart = useCallback(
    (event) => {
      if (!oscillatorIndicators || oscillatorIndicators.length === 0) {
        return;
      }

      event.preventDefault();

      const startY = event.clientY;
      const startHeight = oscillatorHeight;
      const minHeight = 80;
      const maxHeight = 600;

      setIsDragging(true);

      const handleMouseMove = (e) => {
        const delta = e.clientY - startY;
        let next = startHeight - delta;
        if (next < minHeight) next = minHeight;
        if (next > maxHeight) next = maxHeight;
        setOscillatorHeight(next);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        dragStateRef.current = null;
      };

      dragStateRef.current = { handleMouseMove, handleMouseUp };
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [oscillatorIndicators, oscillatorHeight]
  );

  useEffect(() => {
    return () => {
      const dragState = dragStateRef.current;
      if (!dragState) return;
      window.removeEventListener('mousemove', dragState.handleMouseMove);
      window.removeEventListener('mouseup', dragState.handleMouseUp);
      dragStateRef.current = null;
    };
  }, []);

  if (!oscillatorIndicators || oscillatorIndicators.length === 0) {
    return null;
  }

  // Use explicit seriesKey if provided (e.g., for Strategy Lab: "lab|{fileId}")
  // Otherwise construct from asset + timeframe (live chart pattern)
  const key = seriesKeyProp || (selectedAsset && selectedTimeframe ? `${selectedAsset}|${selectedTimeframe}` : null);
  const seriesForKey = key && indicatorSeries ? indicatorSeries[key] : null;
  const statusKey = key && indicatorStatus ? indicatorStatus[key] : null;

  return (
    <>
      <div
        className={`h-2 cursor-row-resize flex items-center justify-center transition-colors duration-200 ${
          isDragging ? 'bg-accent-primary/40' : 'bg-gray-800/80 hover:bg-gray-700'
        } border-y border-gray-700/50`}
        onMouseDown={handleDragStart}
      >
        <div className="flex gap-1">
          <div className="w-1 h-1 rounded-full bg-gray-500"></div>
          <div className="w-1 h-1 rounded-full bg-gray-500"></div>
          <div className="w-1 h-1 rounded-full bg-gray-500"></div>
        </div>
      </div>
      <div className="mt-1 flex flex-col" style={{ height: oscillatorHeight }}>
        <div className="flex-1 flex flex-col gap-2 overflow-y-auto p-1">
          {oscillatorIndicators.map((ind) => {
            const data = seriesForKey && seriesForKey[ind.key] ? seriesForKey[ind.key] : [];

            // Determine type based on indicator value/key
            let type = 'line';
            if (ind.key === 'macd_histogram' || ind.value === 'macd_histogram') type = 'macd';
            else if (ind.value === 'stoch') type = 'stoch';
            else if (ind.value === 'adx') type = 'adx';
            else if (ind.value === 'williams_r') type = 'line'; // Standard line
            else if (ind.value === 'roc') type = 'line'; // Standard line

            return (
              <div key={ind.id} className="h-48 bg-gray-900/60 border border-gray-800 rounded relative">
                <ErrorBoundary>
                  <OscillatorChart
                    mainChart={mainChart}
                    data={data} // Primary data (fallback)
                    allSeries={seriesForKey} // Access to all series
                    indicator={ind} // Full indicator config
                    type={type}
                    title={ind.name || ind.label}
                    params={ind.params}
                    indicatorValue={ind.value}
                    onError={onError}
                  />
                </ErrorBoundary>
                {statusKey === 'loading' && (
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center text-[10px] text-gray-300">
                    Loading {ind.name}...
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};

export default OscillatorPanel;
