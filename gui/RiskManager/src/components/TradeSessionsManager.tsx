import { useMemo, useState } from 'react';
import { Download, BarChart3, Plus, TrendingUp, TrendingDown, Calendar, RotateCcw } from 'lucide-react';
import { RiskCalculator, SessionData } from '../lib/risk-calculations';
import { exportToCSV } from '../lib/export-utils';
import Tooltip from './Tooltip';

interface Trade {
  id: number;
  result: 'win' | 'loss';
}

interface CustomSession {
  id: number;
  trades: Trade[];
  startBalance: number;
  endBalance: number;
  profit: number;
}

interface TradeSessionsManagerProps {
  trades: Trade[];
  balance: number;
  initialBalance: number;
  riskPercent: number;
  drawdownPercent: number;
  riskRewardRatio: number;
  tradesPerSession: number;
  maxSessions: number;
  onTradesPerSessionChange: (value: number) => void;
  onMaxSessionsChange: (value: number) => void;
  canEditSettings: boolean;
  currentSessionNumber: number;
  completedSessions: CustomSession[];
  onAddSession: () => void;
  onAddTrade: (result: 'win' | 'loss') => void;
  onSyncSession: () => void;
  onReset: () => void;
}

export default function TradeSessionsManager({
  trades,
  balance,
  initialBalance,
  riskPercent,
  drawdownPercent,
  riskRewardRatio,
  tradesPerSession,
  maxSessions,
  onTradesPerSessionChange,
  onMaxSessionsChange,
  canEditSettings,
  currentSessionNumber,
  completedSessions,
  onAddSession,
  onAddTrade,
  onSyncSession,
  onReset
}: TradeSessionsManagerProps) {
  const [chartVariant, setChartVariant] = useState<'solid' | 'outlined' | 'glow' | 'gradient'>('solid');
  const allTrades = [...completedSessions.flatMap(s => s.trades), ...trades];
  const wins = allTrades.filter(t => t.result === 'win').length;
  const losses = allTrades.filter(t => t.result === 'loss').length;
  const totalTrades = wins + losses;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const totalProfitLoss = balance - initialBalance;
  const totalProfitLossPercent = initialBalance > 0 ? (totalProfitLoss / initialBalance) * 100 : 0;

  const calculator = new RiskCalculator();

  const metrics = useMemo(() => {
    const totalDrawdownAmount = initialBalance * (drawdownPercent / 100);
    const maxDrawdownLimit = initialBalance - totalDrawdownAmount;
    const takeProfitTarget = initialBalance + (totalDrawdownAmount * riskRewardRatio);

    const profitLoss = balance - initialBalance;
    
    const maxAbsoluteValue = Math.max(
      Math.abs(takeProfitTarget - initialBalance),
      Math.abs(maxDrawdownLimit - initialBalance)
    );

    return {
      maxDrawdownLimit,
      takeProfitTarget,
      profitLoss,
      maxAbsoluteValue,
      isProfit: profitLoss >= 0
    };
  }, [balance, initialBalance, drawdownPercent, riskRewardRatio]);

  const chartHeight = 650;
  const chartWidth = 180;
  const centerY = chartHeight / 2;
  const padding = 40;
  const usableHeight = (chartHeight - padding * 2) / 2;

  const scale = metrics.maxAbsoluteValue > 0 ? usableHeight / metrics.maxAbsoluteValue : 1;

  const barHeight = Math.abs(metrics.profitLoss) * scale;
  const barY = metrics.isProfit ? centerY - barHeight : centerY;
  const barWidth = 50;
  const barX = (chartWidth - barWidth) / 2;

  const takeProfitY = centerY - ((metrics.takeProfitTarget - initialBalance) * scale);
  const drawdownY = centerY - ((metrics.maxDrawdownLimit - initialBalance) * scale);

  const exportTrades = () => {
    const sessionData: SessionData[] = completedSessions.map(s => ({
      sessionNumber: s.id,
      startingBalance: s.startBalance,
      riskPerTrade: calculator.calculateRiskPerTrade(s.startBalance, riskPercent),
      outcome: {
        wins: s.trades.filter(t => t.result === 'win').length,
        losses: s.trades.filter(t => t.result === 'loss').length
      },
      profit: s.profit,
      endingBalance: s.endBalance,
      growthPercent: (s.profit / s.startBalance) * 100
    }));

    const summaryStats = {
      totalProfit: totalProfitLoss,
      totalGrowth: totalProfitLossPercent,
      winRate,
      avgProfit: completedSessions.length > 0 ? totalProfitLoss / completedSessions.length : totalProfitLoss,
      finalBalance: balance
    };

    exportToCSV(sessionData, summaryStats);
  };

  return (
    <div className="bg-[#1a1f2e] border border-gray-800 rounded-2xl p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-white font-semibold text-lg">Trade Sessions Manager</h3>
            <p className="text-gray-400 text-xs">Track your trading performance</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
           {(completedSessions.length > 0 || trades.length > 0) && (
             <button
               onClick={onSyncSession}
               className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors text-sm font-bold"
             >
               <Calendar className="w-4 h-4" />
               Sync
             </button>
           )}
           {(completedSessions.length > 0 || trades.length > 0) && (
             <button
               onClick={exportTrades}
               className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl transition-colors text-sm font-bold"
             >
               <Download className="w-4 h-4" />
               Export
             </button>
           )}
           <button
             onClick={onReset}
             className="p-2.5 bg-[#0f1419] hover:bg-gray-800 border border-gray-700 text-gray-400 rounded-xl transition-colors group"
             title="Reset Session"
           >
             <RotateCcw className="w-4 h-4 group-hover:-rotate-180 transition-transform duration-500" />
           </button>
         </div>
      </div>

      <div className="grid grid-cols-12 gap-6 flex-1 min-h-0 items-start">
        {/* Left Column: SVG Visualization */}
        <div className="col-span-12 lg:col-span-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 w-full">
            <div className="bg-[#0f1419] border border-gray-800 rounded-xl p-3 flex flex-col items-center">
              <div className="text-gray-400 text-[9px] uppercase tracking-wider font-bold mb-1">Balance</div>
              <div className="text-xs font-bold text-white">${balance.toFixed(2)}</div>
            </div>
            <div className="bg-[#0f1419] border border-gray-800 rounded-xl p-3 flex flex-col items-center">
              <div className="text-gray-400 text-[9px] uppercase tracking-wider font-bold mb-1">Session P/L</div>
              <div className={`text-xs font-bold ${metrics.isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                {metrics.isProfit ? '+' : ''}${metrics.profitLoss.toFixed(2)}
              </div>
            </div>
            <div className="bg-[#0f1419] border border-gray-800 rounded-xl p-3 flex flex-col items-center">
              <div className="text-gray-400 text-[9px] uppercase tracking-wider font-bold mb-1">To Target</div>
              <div className="text-xs font-bold text-emerald-400">${(metrics.takeProfitTarget - balance).toFixed(2)}</div>
            </div>
            <div className="bg-[#0f1419] border border-gray-800 rounded-xl p-3 flex flex-col items-center">
              <div className="text-gray-400 text-[9px] uppercase tracking-wider font-bold mb-1">To Limit</div>
              <div className="text-xs font-bold text-red-400">${(balance - metrics.maxDrawdownLimit).toFixed(2)}</div>
            </div>
          </div>

          <div className="bg-[#0f1419] rounded-2xl border border-gray-800 p-6 flex flex-col items-center min-h-[520px] flex-1">

            <div className="flex gap-2 w-full mb-8">
              <button
                onClick={() => onAddTrade('win')}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl transition-all font-bold text-sm shadow-lg shadow-emerald-500/10 active:scale-95"
              >
                <TrendingUp className="w-4 h-4" />
                Add Win
              </button>
              <button
                onClick={() => onAddTrade('loss')}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-all font-bold text-sm shadow-lg shadow-red-500/10 active:scale-95"
              >
                <TrendingDown className="w-4 h-4" />
                Add Loss
              </button>
            </div>

          <div className="relative w-full flex-1" style={{ minHeight: 0 }}>
            <svg
              viewBox={`0 0 ${chartWidth + 200} ${chartHeight}`}
              width="100%"
              height="100%"
              className="overflow-visible"
              preserveAspectRatio="xMidYMid meet"
            >
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
                  <feGaussianBlur stdDeviation="6" result="coloredBlur"/>
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
              </g>

              <rect
                x={barX}
                y={barY}
                width={barWidth}
                height={barHeight}
                fill={chartVariant === 'outlined' ? 'none' : (metrics.isProfit ? 'url(#profitGradient)' : 'url(#lossGradient)')}
                stroke={chartVariant === 'outlined' ? (metrics.isProfit ? '#10b981' : '#ef4444') : 'none'}
                strokeWidth={chartVariant === 'outlined' ? 3 : 0}
                filter={chartVariant === 'glow' ? 'url(#glow)' : 'none'}
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

          {/* Chart Style Variants */}
          <div className="w-full mt-6 p-4 bg-[#1a1f2e]/50 border border-gray-800 rounded-xl">
            <h4 className="text-[10px] uppercase font-black text-gray-500 tracking-wider mb-3">Chart Style Variants</h4>
            <div className="grid grid-cols-2 gap-2">
              {(['solid', 'outlined', 'glow', 'gradient'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setChartVariant(v)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-tight transition-all border ${
                    chartVariant === v
                      ? 'bg-purple-500 border-purple-400 text-white shadow-lg shadow-purple-500/20'
                      : 'bg-[#0f1419] border-gray-800 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  {v.replace('gradient', 'Gradient').replace('glow', 'Glow Effect').replace('solid', 'Solid Fill').replace('outlined', 'Outlined')}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

        {/* Right Column: Stats and History */}
        <div className="col-span-12 lg:col-span-7 flex flex-col gap-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-[#0f1419] rounded-xl p-3 border border-gray-800">
              <div className="flex items-center gap-1 text-gray-400 text-[10px] uppercase tracking-wider font-semibold mb-1">
                Total Trades
                <Tooltip content="Total number of trades executed across all sessions." />
              </div>
              <div className="text-white text-xl font-bold">{totalTrades}</div>
            </div>

            <div className="bg-[#0f1419] rounded-xl p-3 border border-gray-800">
              <div className="flex items-center gap-1 text-gray-400 text-[10px] uppercase tracking-wider font-semibold mb-1">
                Win Rate
                <Tooltip content="Percentage of winning trades out of all trades." />
              </div>
              <div className="text-emerald-400 text-xl font-bold">{winRate.toFixed(1)}%</div>
            </div>

            <div className="bg-[#0f1419] rounded-xl p-3 border border-gray-800">
              <div className="flex items-center gap-1 text-gray-400 text-[10px] uppercase tracking-wider font-semibold mb-1">
                P/L
                <Tooltip content="Net profit or loss from all your trades." />
              </div>
              <div className={`text-xl font-bold ${totalProfitLoss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {totalProfitLoss >= 0 ? '+' : ''}${totalProfitLoss.toFixed(2)}
              </div>
            </div>

            <div className="bg-[#0f1419] rounded-xl p-3 border border-gray-800">
              <div className="flex items-center gap-1 text-gray-400 text-[10px] uppercase tracking-wider font-semibold mb-1">
                Growth
                <Tooltip content="Percentage change from your starting balance." />
              </div>
              <div className={`text-xl font-bold ${totalProfitLossPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {totalProfitLossPercent >= 0 ? '+' : ''}{totalProfitLossPercent.toFixed(2)}%
              </div>
            </div>
          </div>

          <div className="flex gap-4 bg-[#0f1419] p-3 rounded-xl border border-gray-800">
            <div className="flex-1">
              <label className="flex items-center gap-2 text-gray-500 text-[9px] uppercase font-bold mb-1.5 ml-1">
                Trades / Session
                <Tooltip content="Trades per session." />
              </label>
              <input
                type="number"
                value={tradesPerSession}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  if (!isNaN(value) && value > 0 && value <= 100) onTradesPerSessionChange(value);
                }}
                disabled={!canEditSettings}
                className="w-full px-2 py-1.5 bg-[#1a1f2e] border border-gray-700 rounded-lg text-white text-xs focus:border-blue-500 focus:outline-none disabled:opacity-50"
              />
            </div>

            <div className="flex-1">
              <label className="flex items-center gap-2 text-gray-500 text-[9px] uppercase font-bold mb-1.5 ml-1">
                Max Sessions
                <Tooltip content="Total planned sessions." />
              </label>
              <input
                type="number"
                value={maxSessions}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  if (!isNaN(value) && value > 0 && value <= 50) onMaxSessionsChange(value);
                }}
                disabled={!canEditSettings}
                className="w-full px-2 py-1.5 bg-[#1a1f2e] border border-gray-700 rounded-lg text-white text-xs focus:border-blue-500 focus:outline-none disabled:opacity-50"
              />
            </div>
          </div>

          <div className="mt-2">
            <button
              onClick={onAddSession}
              className="w-full py-3 bg-[#0f1419] hover:bg-gray-800 border border-gray-700 text-gray-400 rounded-xl transition-all flex items-center justify-center gap-2 font-bold text-xs"
              title="Add Session"
            >
              <Plus className="w-4 h-4" />
              Add Session
            </button>
          </div>

          <div className="flex flex-col min-h-[240px]">
            <div className="flex items-center justify-between mb-3 px-1">
              <h4 className="text-white font-bold text-xs uppercase tracking-tight">History ({currentSessionNumber}/{maxSessions})</h4>
              <span className="text-gray-500 text-[10px] font-bold">{trades.length}/{tradesPerSession} TRADES</span>
            </div>

            <div className="bg-[#0f1419] rounded-xl p-4 border border-gray-800 overflow-auto min-h-[200px]">
              {trades.length > 0 || completedSessions.length > 0 ? (
                <div className="space-y-4">
                  {completedSessions.map((session) => (
                    <div key={session.id} className="border-b border-gray-800 pb-3 last:border-0">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-400 text-xs font-semibold">Session {session.id}</span>
                        <span className={`text-xs font-semibold ${session.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {session.profit >= 0 ? '+' : ''}${session.profit.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {session.trades.map((trade) => (
                          <div
                            key={trade.id}
                            className={`px-3 py-1 rounded-lg font-semibold text-xs ${
                              trade.result === 'win'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-red-500/20 text-red-400 border border-red-500/30'
                            }`}
                          >
                            {trade.result === 'win' ? 'W' : 'L'}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {trades.length > 0 && (
                    <div className="pt-2">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-blue-400 text-xs font-semibold">Session {currentSessionNumber} (In Progress)</span>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {trades.map((trade) => (
                          <div
                            key={trade.id}
                            className={`px-3 py-1 rounded-lg font-semibold text-xs ${
                              trade.result === 'win'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-red-500/20 text-red-400 border border-red-500/30'
                            }`}
                          >
                            {trade.result === 'win' ? 'W' : 'L'}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center py-8">
                  <div className="w-12 h-12 bg-gray-800/50 rounded-xl flex items-center justify-center mb-3">
                    <BarChart3 className="w-6 h-6 text-gray-600" />
                  </div>
                  <p className="text-gray-400 text-sm mb-1">No trades recorded yet</p>
                  <p className="text-gray-600 text-xs">Use the controls below to add wins or losses</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
