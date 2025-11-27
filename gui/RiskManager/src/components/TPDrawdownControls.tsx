import { useMemo } from 'react';
import { Target } from 'lucide-react';
import Tooltip from './Tooltip';

interface TPDrawdownControlsProps {
  balance: number;
  initialBalance: number;
  riskPercentPerTrade: number;
  drawdownPercent: number;
  riskRewardRatio: number;
}

export default function TPDrawdownControls({
  balance,
  initialBalance,
  riskPercentPerTrade,
  drawdownPercent,
  riskRewardRatio
}: TPDrawdownControlsProps) {
  const metrics = useMemo(() => {
    const riskPerTrade = balance * (riskPercentPerTrade / 100);
    const rewardPerTrade = riskPerTrade * riskRewardRatio;
    const totalDrawdownAmount = initialBalance * (drawdownPercent / 100);
    const maxDrawdownLimit = initialBalance - totalDrawdownAmount;
    const takeProfitTarget = initialBalance + (totalDrawdownAmount * riskRewardRatio);

    const profitLoss = balance - initialBalance;
    const profitLossPercent = initialBalance > 0 ? (profitLoss / initialBalance) * 100 : 0;

    const maxAbsoluteValue = Math.max(
      Math.abs(takeProfitTarget - initialBalance),
      Math.abs(maxDrawdownLimit - initialBalance)
    );

    return {
      riskPerTrade,
      rewardPerTrade,
      totalDrawdownAmount,
      maxDrawdownLimit,
      takeProfitTarget,
      profitLoss,
      profitLossPercent,
      maxAbsoluteValue,
      isProfit: profitLoss >= 0
    };
  }, [balance, initialBalance, riskPercentPerTrade, drawdownPercent, riskRewardRatio]);

  const chartHeight = 500;
  const chartWidth = 140;
  const centerY = chartHeight / 2;
  const padding = 40;
  const usableHeight = (chartHeight - padding * 2) / 2;

  const scale = usableHeight / metrics.maxAbsoluteValue;

  const barHeight = Math.abs(metrics.profitLoss) * scale;
  const barY = metrics.isProfit ? centerY - barHeight : centerY;
  const barWidth = 50;
  const barX = (chartWidth - barWidth) / 2;

  const takeProfitY = centerY - ((metrics.takeProfitTarget - initialBalance) * scale);
  const drawdownY = centerY - ((metrics.maxDrawdownLimit - initialBalance) * scale);

  return (
    <div className="bg-[#1a1f2e] border border-gray-800 rounded-2xl p-6 h-full flex flex-col">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-xl flex items-center justify-center">
          <Target className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="text-white font-semibold text-lg">T/P & Drawdown Controls</h3>
          <p className="text-gray-400 text-xs">Session progress visualization</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-[#0f1419] rounded-xl p-3 border border-gray-800">
          <div className="flex items-center gap-1 text-gray-400 text-xs mb-1">
            Current Balance
            <Tooltip content="Your real-time account balance, updated after each trade." />
          </div>
          <div className="text-white text-lg font-bold">${balance.toFixed(2)}</div>
        </div>

        <div className="bg-[#0f1419] rounded-xl p-3 border border-gray-800">
          <div className="flex items-center gap-1 text-gray-400 text-xs mb-1">
            P/L
            <Tooltip content="Profit/Loss - Your gain or loss since starting. Shows both dollar amount and percentage." />
          </div>
          <div className={`text-lg font-bold ${metrics.isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
            {metrics.isProfit ? '+' : ''}${metrics.profitLoss.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="relative">
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
            <g>
              <text
                x={chartWidth + 10}
                y={takeProfitY}
                fill="#10b981"
                fontSize="12"
                fontWeight="600"
                dominantBaseline="middle"
              >
              Take Profit: +{((metrics.takeProfitTarget - initialBalance) / initialBalance * 100).toFixed(1)}%
              </text>
              <text
                x={chartWidth + 10}
                y={takeProfitY + 15}
                fill="#10b981"
                fontSize="11"
                opacity="0.8"
                dominantBaseline="middle"
              >
                ${metrics.takeProfitTarget.toFixed(2)}
              </text>
              <foreignObject x={chartWidth + 185} y={takeProfitY - 8} width="20" height="20">
                <div style={{ display: 'flex' }}>
                  <Tooltip content="Your profit target - the balance you're aiming to reach based on your drawdown limit and risk/reward ratio. Reaching this means you've gained what you were willing to risk." />
                </div>
              </foreignObject>
            </g>

            <line
              x1="0"
              y1={centerY}
              x2={chartWidth}
              y2={centerY}
              stroke="#6b7280"
              strokeWidth="2"
            />
            <g>
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
              ${initialBalance.toFixed(2)}
              </text>
              <foreignObject x={chartWidth + 185} y={centerY - 8} width="20" height="20">
                <div style={{ display: 'flex' }}>
                  <Tooltip content="Your starting balance - the baseline for measuring profit and loss. This is your zero point." />
                </div>
              </foreignObject>
            </g>

            <line
              x1="0"
              y1={drawdownY}
              x2={chartWidth}
              y2={drawdownY}
              stroke="#ef4444"
              strokeWidth="2"
              strokeDasharray="5,5"
            />
            <g>
              <text
                x={chartWidth + 10}
                y={drawdownY}
                fill="#ef4444"
                fontSize="12"
                fontWeight="600"
                dominantBaseline="middle"
              >
                Max Drawdown: -{drawdownPercent.toFixed(1)}%
              </text>
              <text
                x={chartWidth + 10}
                y={drawdownY + 15}
                fill="#ef4444"
                fontSize="11"
                opacity="0.8"
                dominantBaseline="middle"
              >
                ${metrics.maxDrawdownLimit.toFixed(2)}
              </text>
              <foreignObject x={chartWidth + 185} y={drawdownY - 8} width="20" height="20">
                <div style={{ display: 'flex' }}>
                  <Tooltip content="Your maximum loss limit - the lowest balance you'll accept before stopping trading. This protects your capital from excessive losses." />
                </div>
              </foreignObject>
            </g>

            <rect
              x={barX}
              y={barY}
              width={barWidth}
              height={barHeight}
              fill={`url(#${metrics.isProfit ? 'profitGradient' : 'lossGradient'})`}
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
                  ${balance.toFixed(2)}
                </text>
              </>
            )}
          </svg>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <div className="bg-[#0f1419] border border-gray-800 rounded-xl p-3">
          <div className="text-gray-400 text-xs mb-1">Progress</div>
          <div className={`text-base font-bold ${metrics.isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
            {metrics.isProfit ? '+' : ''}{metrics.profitLossPercent.toFixed(2)}%
          </div>
        </div>
        <div className="bg-[#0f1419] border border-gray-800 rounded-xl p-3">
          <div className="text-gray-400 text-xs mb-1">To Target</div>
          <div className="text-base font-bold text-emerald-400">
            ${(metrics.takeProfitTarget - balance).toFixed(2)}
          </div>
        </div>
        <div className="bg-[#0f1419] border border-gray-800 rounded-xl p-3">
          <div className="text-gray-400 text-xs mb-1">To Limit</div>
          <div className="text-base font-bold text-red-400">
            ${(balance - metrics.maxDrawdownLimit).toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
}
