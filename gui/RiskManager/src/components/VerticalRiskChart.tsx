import { useMemo } from 'react';

interface VerticalRiskChartProps {
  startingBalance: number;
  currentBalance: number;
  takeProfitTarget: number;
  maxDrawdownLimit: number;
  variant?: 'solid' | 'outlined' | 'glow' | 'dual';
}

export default function VerticalRiskChart({
  startingBalance,
  currentBalance,
  takeProfitTarget,
  maxDrawdownLimit,
  variant = 'solid'
}: VerticalRiskChartProps) {
  const metrics = useMemo(() => {
    const profitLoss = currentBalance - startingBalance;
    const profitLossPercent = (profitLoss / startingBalance) * 100;
    const takeProfitAmount = takeProfitTarget - startingBalance;
    const takeProfitPercent = (takeProfitAmount / startingBalance) * 100;
    const drawdownAmount = maxDrawdownLimit - startingBalance;
    const drawdownPercent = (drawdownAmount / startingBalance) * 100;

    const maxAbsoluteValue = Math.max(
      Math.abs(takeProfitAmount),
      Math.abs(drawdownAmount)
    );

    return {
      profitLoss,
      profitLossPercent,
      takeProfitAmount,
      takeProfitPercent,
      drawdownAmount,
      drawdownPercent,
      maxAbsoluteValue,
      isProfit: profitLoss >= 0
    };
  }, [startingBalance, currentBalance, takeProfitTarget, maxDrawdownLimit]);

  const chartHeight = 400;
  const chartWidth = 120;
  const centerY = chartHeight / 2;
  const padding = 40;
  const usableHeight = (chartHeight - padding * 2) / 2;

  const scale = usableHeight / metrics.maxAbsoluteValue;

  const barHeight = Math.abs(metrics.profitLoss) * scale;
  const barY = metrics.isProfit ? centerY - barHeight : centerY;
  const barWidth = 40;
  const barX = (chartWidth - barWidth) / 2;

  const takeProfitY = centerY - (metrics.takeProfitAmount * scale);
  const drawdownY = centerY - (metrics.drawdownAmount * scale);

  const getBarStyle = () => {
    const baseColor = metrics.isProfit ? '#10b981' : '#ef4444';

    switch (variant) {
      case 'outlined':
        return {
          fill: 'none',
          stroke: baseColor,
          strokeWidth: 3
        };
      case 'glow':
        return {
          fill: baseColor,
          filter: 'url(#glow)'
        };
      case 'dual':
        return {
          fill: `url(#${metrics.isProfit ? 'profitGradient' : 'lossGradient'})`
        };
      case 'solid':
      default:
        return {
          fill: `url(#${metrics.isProfit ? 'profitGradient' : 'lossGradient'})`
        };
    }
  };

  return (
    <div className="bg-[#0f1419] border border-gray-800 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-white font-semibold text-lg">Risk Visualization Chart</h3>
        <div className={`px-3 py-1 rounded-lg text-sm font-semibold ${
          metrics.isProfit ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
        }`}>
          {metrics.isProfit ? '+' : ''}{metrics.profitLossPercent.toFixed(2)}%
        </div>
      </div>

      <div className="flex items-center justify-center">
        <svg width={chartWidth + 200} height={chartHeight} className="overflow-visible">
          <defs>
            <linearGradient id="profitGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#059669" stopOpacity="0.7" />
            </linearGradient>
            <linearGradient id="lossGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#dc2626" stopOpacity="0.9" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          <rect
            x="0"
            y={takeProfitY}
            width={chartWidth}
            height={centerY - takeProfitY}
            fill="#10b981"
            opacity="0.05"
          />
          <rect
            x="0"
            y={centerY}
            width={chartWidth}
            height={drawdownY - centerY}
            fill="#ef4444"
            opacity="0.05"
          />

          <line
            x1="0"
            y1={takeProfitY}
            x2={chartWidth}
            y2={takeProfitY}
            stroke="#10b981"
            strokeWidth="2"
            strokeDasharray="5,5"
          />
          <text
            x={chartWidth + 10}
            y={takeProfitY}
            fill="#10b981"
            fontSize="12"
            fontWeight="600"
            dominantBaseline="middle"
          >
            Take Profit: +{metrics.takeProfitPercent.toFixed(1)}%
          </text>
          <text
            x={chartWidth + 10}
            y={takeProfitY + 15}
            fill="#10b981"
            fontSize="11"
            opacity="0.8"
            dominantBaseline="middle"
          >
            ${takeProfitTarget.toFixed(2)}
          </text>

          <line
            x1="0"
            y1={centerY}
            x2={chartWidth}
            y2={centerY}
            stroke="#6b7280"
            strokeWidth="2"
          />
          <text
            x={chartWidth + 10}
            y={centerY}
            fill="#9ca3af"
            fontSize="12"
            fontWeight="600"
            dominantBaseline="middle"
          >
            Starting Balance: 0%
          </text>
          <text
            x={chartWidth + 10}
            y={centerY + 15}
            fill="#9ca3af"
            fontSize="11"
            opacity="0.8"
            dominantBaseline="middle"
          >
            ${startingBalance.toFixed(2)}
          </text>

          <line
            x1="0"
            y1={drawdownY}
            x2={chartWidth}
            y2={drawdownY}
            stroke="#ef4444"
            strokeWidth="2"
            strokeDasharray="5,5"
          />
          <text
            x={chartWidth + 10}
            y={drawdownY}
            fill="#ef4444"
            fontSize="12"
            fontWeight="600"
            dominantBaseline="middle"
          >
            Max Drawdown: {metrics.drawdownPercent.toFixed(1)}%
          </text>
          <text
            x={chartWidth + 10}
            y={drawdownY + 15}
            fill="#ef4444"
            fontSize="11"
            opacity="0.8"
            dominantBaseline="middle"
          >
            ${maxDrawdownLimit.toFixed(2)}
          </text>

          <rect
            x={barX}
            y={barY}
            width={barWidth}
            height={barHeight}
            {...getBarStyle()}
            rx="4"
            className="transition-all duration-500 ease-out"
          />

          {metrics.profitLoss !== 0 && (
            <>
              <circle
                cx={barX + barWidth / 2}
                cy={metrics.isProfit ? barY : barY + barHeight}
                r="4"
                fill={metrics.isProfit ? '#10b981' : '#ef4444'}
              />
              <text
                x={barX + barWidth / 2}
                y={metrics.isProfit ? barY - 15 : barY + barHeight + 25}
                fill="white"
                fontSize="14"
                fontWeight="700"
                textAnchor="middle"
              >
                ${currentBalance.toFixed(2)}
              </text>
            </>
          )}
        </svg>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className="bg-[#1a1f2e] border border-gray-800 rounded-xl p-3">
          <div className="text-gray-400 text-xs mb-1">Current P/L</div>
          <div className={`text-lg font-bold ${metrics.isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
            {metrics.isProfit ? '+' : ''}{metrics.profitLoss.toFixed(2)}
          </div>
        </div>
        <div className="bg-[#1a1f2e] border border-gray-800 rounded-xl p-3">
          <div className="text-gray-400 text-xs mb-1">To Target</div>
          <div className="text-lg font-bold text-emerald-400">
            ${(takeProfitTarget - currentBalance).toFixed(2)}
          </div>
        </div>
        <div className="bg-[#1a1f2e] border border-gray-800 rounded-xl p-3">
          <div className="text-gray-400 text-xs mb-1">To Limit</div>
          <div className="text-lg font-bold text-red-400">
            ${(currentBalance - maxDrawdownLimit).toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
}
