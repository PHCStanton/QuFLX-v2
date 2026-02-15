import React from 'react';

const TooltipRow = React.memo(({ label, value, color, className = '' }) => (
  <div className={`flex justify-between items-center text-xs gap-3 ${className}`}>
    <span className="text-gray-400 font-medium">{label}</span>
    <span className="font-mono font-bold" style={{ color: color || '#e5e7eb' }}>
      {value}
    </span>
  </div>
));
TooltipRow.displayName = 'TooltipRow';

const ChartTooltip = ({ 
  visible, 
  left, 
  top, 
  ohlc, 
  indicators = [], 
  containerWidth,
  containerHeight 
}) => {
  if (!visible || !ohlc) return null;

  // Smart positioning to keep tooltip inside chart boundaries
  const tooltipWidth = 180; // Approximate width
  const tooltipHeight = 120 + indicators.length * 20; // Dynamic height
  
  let x = left + 15;
  let y = top + 15;

  // Flip to left if too close to right edge
  if (x + tooltipWidth > containerWidth) {
    x = left - tooltipWidth - 15;
  }

  // Flip up if too close to bottom edge
  if (y + tooltipHeight > containerHeight) {
    y = top - tooltipHeight - 15;
  }
  
  // Ensure we don't go off-screen top/left
  if (x < 10) x = 10;
  if (y < 10) y = 10;

  const priceColor = ohlc.close >= ohlc.open ? '#22c55e' : '#ef4444';

  return (
    <div
      className="absolute z-50 pointer-events-none rounded-lg p-2.5 shadow-xl border border-gray-700/50 backdrop-blur-md bg-gray-900/90 text-sm select-none flex flex-col gap-1"
      style={{
        left: x,
        top: y,
        width: 'max-content',
        maxWidth: '220px',
      }}
    >
      {/* Header: Date/Time (Optional, if passed) */}
      {/* Price Section */}
      <div className="flex flex-col gap-0.5 border-b border-gray-700/50 pb-2 mb-1">
        <div className="flex justify-between gap-4 font-bold text-gray-200">
          <span>O</span> <span style={{ color: priceColor }}>{ohlc.open}</span>
        </div>
        <div className="flex justify-between gap-4 font-bold text-gray-200">
          <span>H</span> <span style={{ color: priceColor }}>{ohlc.high}</span>
        </div>
        <div className="flex justify-between gap-4 font-bold text-gray-200">
          <span>L</span> <span style={{ color: priceColor }}>{ohlc.low}</span>
        </div>
        <div className="flex justify-between gap-4 font-bold text-gray-200">
          <span>C</span> <span style={{ color: priceColor }}>{ohlc.close}</span>
        </div>
      </div>

      {/* Indicators Section */}
      {indicators.length > 0 && (
        <div className="flex flex-col gap-1">
          {indicators.map((ind, idx) => (
            <TooltipRow 
              key={`${ind.label}-${idx}`} 
              label={ind.label} 
              value={ind.value} 
              color={ind.color} 
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default React.memo(ChartTooltip);
