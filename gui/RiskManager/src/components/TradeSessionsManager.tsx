import { Download, BarChart3, Plus } from 'lucide-react';
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
  profit: number;
  endBalance: number;
}

interface TradeSessionsManagerProps {
  trades: Trade[];
  balance: number;
  initialBalance: number;
  riskPercent: number;
  tradesPerSession: number;
  maxSessions: number;
  onTradesPerSessionChange: (value: number) => void;
  onMaxSessionsChange: (value: number) => void;
  canEditSettings: boolean;
  currentSessionNumber: number;
  completedSessions: CustomSession[];
  onAddSession: () => void;
  onAddTrade: () => void;
}

export default function TradeSessionsManager({
  trades,
  balance,
  initialBalance,
  riskPercent,
  tradesPerSession,
  maxSessions,
  onTradesPerSessionChange,
  onMaxSessionsChange,
  canEditSettings,
  currentSessionNumber,
  completedSessions,
  onAddSession,
  onAddTrade
}: TradeSessionsManagerProps) {
  const allTrades = [...completedSessions.flatMap(s => s.trades), ...trades];
  const wins = allTrades.filter(t => t.result === 'win').length;
  const losses = allTrades.filter(t => t.result === 'loss').length;
  const totalTrades = wins + losses;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const profitLoss = balance - initialBalance;
  const profitLossPercent = initialBalance > 0 ? (profitLoss / initialBalance) * 100 : 0;

  const calculator = new RiskCalculator();

  const exportTrades = () => {
    const sessionData: SessionData[] = [{
      sessionNumber: 1,
      startingBalance: initialBalance,
      riskPerTrade: calculator.calculateRiskPerTrade(initialBalance, riskPercent),
      outcome: {
        wins,
        losses
      },
      profit: profitLoss,
      endingBalance: balance,
      growthPercent: profitLossPercent
    }];

    const summaryStats = {
      totalProfit: profitLoss,
      totalGrowth: profitLossPercent,
      winRate,
      avgProfit: profitLoss,
      finalBalance: balance
    };

    exportToCSV(sessionData, summaryStats);
  };

  return (
    <div className="bg-[#1a1f2e] border border-gray-800 rounded-2xl p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-white font-semibold text-lg">Trade Sessions Manager</h3>
            <p className="text-gray-400 text-xs">Track your trading performance</p>
          </div>
        </div>

        { trades.length > 0 && (
          <button
            onClick={exportTrades}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <label className="flex items-center gap-2 text-gray-400 text-xs mb-2">
            Trades per Session
            <Tooltip content="How many trades make up one trading session. After completing this many trades, you'll review your session performance." />
            {!canEditSettings && <span className="text-xs ml-2 text-gray-500">(Reset to edit)</span>}
          </label>
          <input
            type="number"
            value={tradesPerSession}
            onChange={(e) => {
              const value = parseInt(e.target.value);
              if (!isNaN(value) && value > 0 && value <= 100) {
                onTradesPerSessionChange(value);
              }
            }}
            disabled={!canEditSettings}
            className="w-full px-3 py-2 bg-[#0f1419] border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none disabled:opacity-75 disabled:cursor-not-allowed"
            min="1"
            max="100"
          />
        </div>

        <div>
          <label className="flex items-center gap-2 text-gray-400 text-xs mb-2">
            Max Sessions
            <Tooltip content="The total number of trading sessions you want to complete. After finishing all sessions, you'll see your overall performance summary." />
            {!canEditSettings && <span className="text-xs ml-2 text-gray-500">(Reset to edit)</span>}
          </label>
          <input
            type="number"
            value={maxSessions}
            onChange={(e) => {
              const value = parseInt(e.target.value);
              if (!isNaN(value) && value > 0 && value <= 50) {
                onMaxSessionsChange(value);
              }
            }}
            disabled={!canEditSettings}
            className="w-full px-3 py-2 bg-[#0f1419] border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none disabled:opacity-75 disabled:cursor-not-allowed"
            min="1"
            max="50"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-[#0f1419] rounded-xl p-4 border border-gray-800">
          <div className="flex items-center gap-1 text-gray-400 text-xs mb-1">
            Total Trades
            <Tooltip content="Total number of trades executed across all sessions." />
          </div>
          <div className="text-white text-2xl font-bold">{totalTrades}</div>
        </div>

        <div className="bg-[#0f1419] rounded-xl p-4 border border-gray-800">
          <div className="flex items-center gap-1 text-gray-400 text-xs mb-1">
            Win Rate
            <Tooltip content="Percentage of winning trades out of all trades. Higher is better, but must be balanced with your risk/reward ratio." />
          </div>
          <div className="text-emerald-400 text-2xl font-bold">
            {winRate.toFixed(1)}%
          </div>
        </div>

        <div className="bg-[#0f1419] rounded-xl p-4 border border-gray-800">
          <div className="flex items-center gap-1 text-gray-400 text-xs mb-1">
            Total Profit/Loss
            <Tooltip content="Net profit or loss from all your trades. Green means you're up, red means you're down." />
          </div>
          <div className={`text-2xl font-bold ${profitLoss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {profitLoss >= 0 ? '+' : ''}${profitLoss.toFixed(2)}
          </div>
        </div>

        <div className="bg-[#0f1419] rounded-xl p-4 border border-gray-800">
          <div className="flex items-center gap-1 text-gray-400 text-xs mb-1">
            Account Growth
            <Tooltip content="Percentage change from your starting balance. This shows your overall performance as a percentage." />
          </div>
          <div className={`text-2xl font-bold ${profitLossPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {profitLossPercent >= 0 ? '+' : ''}{profitLossPercent.toFixed(2)}%
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-white font-semibold text-sm">Current Session ({currentSessionNumber}/{maxSessions})</h4>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-gray-400">{trades.length}/{tradesPerSession} trades</span>
          </div>
        </div>

        {trades.length > 0 || completedSessions.length > 0 ? (
          <div className="flex-1 bg-[#0f1419] rounded-xl p-4 border border-gray-800 overflow-auto">
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
          </div>
        ) : (
          <div className="flex-1 bg-[#0f1419] rounded-xl p-8 border border-gray-800 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center mb-3">
              <BarChart3 className="w-6 h-6 text-gray-600" />
            </div>
            <p className="text-gray-400 text-sm mb-1">No trades recorded yet</p>
            <p className="text-gray-600 text-xs">Use the controls above to add wins or losses</p>
          </div>
        )}
      </div>

      <div className="pt-4 mt-4 border-t border-gray-800/50 flex gap-3">
        <button
          onClick={onAddSession}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#0f1419] hover:bg-gray-800 border border-gray-700 text-blue-400 rounded-xl transition-colors text-xs font-bold"
        >
          <Plus className="w-4 h-4" />
          Add Session
        </button>
        <button
          onClick={onAddTrade}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#0f1419] hover:bg-gray-800 border border-gray-700 text-emerald-400 rounded-xl transition-colors text-xs font-bold"
        >
          <Plus className="w-4 h-4" />
          Add Trade
        </button>
      </div>
    </div>
  );
}
