import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Link, Unlink, RotateCcw, Activity, Target } from 'lucide-react';

const RISK_REWARD_RATIOS = [
  { label: '1:1', value: 1 },
  { label: '1:1.5', value: 1.5 },
  { label: '1:2', value: 2 },
  { label: '1:3', value: 3 }
];

interface Trade {
  id: number;
  result: 'win' | 'loss';
}

interface TradingMetricsChartProps {
  isLinked: boolean;
  onToggleLink: () => void;
  linkedBalance?: number;
  linkedTrades?: Trade[];
  linkedRiskPercent?: number;
  linkedInitialBalance?: number;
  onLinkedReset?: () => void;
}

export default function TradingMetricsChart({
  isLinked,
  onToggleLink,
  linkedBalance,
  linkedTrades = [],
  linkedRiskPercent,
  linkedInitialBalance,
  onLinkedReset
}: TradingMetricsChartProps) {
  const [independentBalance, setIndependentBalance] = useState(1000);
  const [independentInitialBalance, setIndependentInitialBalance] = useState(1000);
  const [independentRiskPercent, setIndependentRiskPercent] = useState(1.0);
  const [independentRiskRewardRatio, setIndependentRiskRewardRatio] = useState(2);
  const [independentTrades, setIndependentTrades] = useState<Trade[]>([]);
  const [balanceInput, setBalanceInput] = useState('1000');
  const [customRiskInput, setCustomRiskInput] = useState('');
  const [customRatioInput, setCustomRatioInput] = useState('');

  const balance = isLinked ? (linkedBalance ?? 1000) : independentBalance;
  const initialBalance = isLinked ? (linkedInitialBalance ?? 1000) : independentInitialBalance;
  const riskPercent = isLinked ? (linkedRiskPercent ?? 1.0) : independentRiskPercent;
  const riskRewardRatio = independentRiskRewardRatio;
  const trades = isLinked ? linkedTrades : independentTrades;

  const wins = trades.filter(t => t.result === 'win').length;
  const losses = trades.filter(t => t.result === 'loss').length;
  const totalTrades = wins + losses;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const profitLoss = balance - initialBalance;
  const profitLossPercent = initialBalance > 0 ? (profitLoss / initialBalance) * 100 : 0;
  const riskPerTrade = balance * (riskPercent / 100);

  const riskAmount = initialBalance * (riskPercent / 100);
  const rewardAmount = riskAmount * riskRewardRatio;
  const takeProfitTarget = initialBalance + rewardAmount;
  const maxDrawdownLimit = initialBalance - riskAmount;
  const rewardPercentage = (rewardAmount / initialBalance) * 100;
  const requiredWinRate = (1 / (1 + riskRewardRatio)) * 100;

  useEffect(() => {
    if (isLinked && linkedTrades) {
      setIndependentTrades([]);
    }
  }, [isLinked, linkedTrades]);

  const addIndependentTrade = (result: 'win' | 'loss') => {
    if (isLinked) return;

    const newTrade: Trade = {
      id: Date.now(),
      result
    };

    const currentRiskAmount = independentBalance * (independentRiskPercent / 100);
    let balanceChange = 0;

    if (result === 'win') {
      balanceChange = currentRiskAmount * 0.92;
    } else {
      balanceChange = -currentRiskAmount;
    }

    const newBalance = independentBalance + balanceChange;
    setIndependentBalance(newBalance);
    setIndependentTrades([...independentTrades, newTrade]);
  };

  const resetIndependent = () => {
    setIndependentBalance(independentInitialBalance);
    setIndependentTrades([]);
  };

  const handleBalanceChange = (value: string) => {
    setBalanceInput(value);
    const normalized = value.replace(/,/g, '.');
    const numValue = parseFloat(normalized);
    if (!isNaN(numValue) && numValue > 0) {
      setIndependentInitialBalance(numValue);
      setIndependentBalance(numValue);
    }
  };

  const handleBalanceBlur = () => {
    if (independentInitialBalance > 0) {
      setBalanceInput(independentInitialBalance.toFixed(2));
    }
  };

  const handleCustomRiskChange = (value: string) => {
    setCustomRiskInput(value);
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) {
      setIndependentRiskPercent(numValue);
    }
  };

  const handleCustomRatioChange = (value: string) => {
    setCustomRatioInput(value);
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 10) {
      setIndependentRiskRewardRatio(parsed);
    }
  };

  const canEditIndependentSettings = !isLinked && independentTrades.length === 0;

  const progressToTarget = takeProfitTarget > initialBalance
    ? ((balance - initialBalance) / (takeProfitTarget - initialBalance)) * 100
    : 0;
  const progressToDrawdown = maxDrawdownLimit < initialBalance
    ? ((initialBalance - balance) / (initialBalance - maxDrawdownLimit)) * 100
    : 0;

  const progressPercent = balance >= initialBalance ? progressToTarget : -progressToDrawdown;

  return (
    <div className="bg-[#1a1f2e] border border-gray-800 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-white font-semibold text-lg">Live Session Metrics</h3>
            <p className="text-gray-400 text-xs">
              {isLinked ? 'Synced with Custom Calculator' : 'Independent Mode'}
            </p>
          </div>
        </div>

        <button
          onClick={onToggleLink}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${
            isLinked
              ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
              : 'bg-[#0f1419] border border-gray-700 text-gray-400 hover:border-emerald-500 hover:text-emerald-400'
          }`}
        >
          {isLinked ? (
            <>
              <Link className="w-4 h-4" />
              Linked
            </>
          ) : (
            <>
              <Unlink className="w-4 h-4" />
              Link to Calculator
            </>
          )}
        </button>
      </div>

      {!isLinked && (
        <div className="mb-6 space-y-4">
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block text-gray-400 text-xs mb-2">
              Starting Balance
              {!canEditIndependentSettings && <span className="text-xs ml-2 text-gray-500">(Reset to edit)</span>}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              {canEditIndependentSettings ? (
                <input
                  type="text"
                  inputMode="decimal"
                  value={balanceInput}
                  onChange={(e) => handleBalanceChange(e.target.value)}
                  onBlur={handleBalanceBlur}
                  className="w-full pl-8 pr-3 py-2 bg-[#0f1419] border border-gray-700 rounded-lg text-white text-sm focus:border-emerald-500 focus:outline-none"
                  placeholder="1000"
                />
              ) : (
                <input
                  type="text"
                  value={independentInitialBalance.toFixed(2)}
                  readOnly
                  className="w-full pl-8 pr-3 py-2 bg-[#0f1419] border border-gray-700 rounded-lg text-white text-sm cursor-not-allowed opacity-75"
                />
              )}
            </div>
          </div>

          <div>
            <label className="block text-gray-400 text-xs mb-2">Risk Percentage</label>
            <div className="flex gap-2 mb-2">
              {[1, 5, 10].map((percent) => (
                <button
                  key={percent}
                  onClick={() => {
                    setIndependentRiskPercent(percent);
                    setCustomRiskInput('');
                  }}
                  disabled={!canEditIndependentSettings}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                    independentRiskPercent === percent && customRiskInput === '' && canEditIndependentSettings
                      ? 'bg-emerald-500 text-white'
                      : 'bg-[#0f1419] text-gray-400 border border-gray-700'
                  } ${!canEditIndependentSettings ? 'opacity-50 cursor-not-allowed' : 'hover:border-gray-600'}`}
                >
                  {percent}%
                </button>
              ))}
            </div>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                value={customRiskInput}
                onChange={(e) => handleCustomRiskChange(e.target.value.replace(/,/g, '.'))}
                placeholder="Custom % (e.g., 2.50)"
                disabled={!canEditIndependentSettings}
                className="w-full px-3 py-2 bg-[#0f1419] border border-gray-700 rounded-lg text-white text-xs placeholder:text-gray-600 focus:border-emerald-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">%</span>
            </div>
          </div>

          <div className="flex flex-col justify-end">
            <label className="block text-gray-400 text-xs mb-2">Quick Actions</label>
            <div className="flex gap-2">
              <button
                onClick={() => addIndependentTrade('win')}
                disabled={isLinked}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-xs font-medium"
              >
                <TrendingUp className="w-3 h-3" />
                Win
              </button>
              <button
                onClick={() => addIndependentTrade('loss')}
                disabled={isLinked}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-xs font-medium"
              >
                <TrendingDown className="w-3 h-3" />
                Loss
              </button>
              <button
                onClick={isLinked ? onLinkedReset : resetIndependent}
                className="px-3 py-2 bg-[#0f1419] hover:bg-gray-800 border border-gray-700 text-gray-400 rounded-lg transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        <div className="bg-[#0f1419] border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-blue-400" />
            <label className="text-gray-400 text-sm font-medium">Risk/Reward Ratio</label>
          </div>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {RISK_REWARD_RATIOS.map((ratio) => (
              <button
                key={ratio.value}
                onClick={() => {
                  setIndependentRiskRewardRatio(ratio.value);
                  setCustomRatioInput('');
                }}
                disabled={!canEditIndependentSettings}
                className={`px-3 py-2 rounded-lg font-semibold transition-all text-xs ${
                  independentRiskRewardRatio === ratio.value && !customRatioInput && canEditIndependentSettings
                    ? 'bg-blue-500 text-white'
                    : 'bg-[#0f1419] border border-gray-700 text-gray-400'
                } ${!canEditIndependentSettings ? 'opacity-50 cursor-not-allowed' : 'hover:border-gray-600'}`}
              >
                {ratio.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-gray-400 text-xs">Custom:</span>
            <input
              type="number"
              value={customRatioInput}
              onChange={(e) => handleCustomRatioChange(e.target.value)}
              placeholder="e.g., 2.5"
              disabled={!canEditIndependentSettings}
              className="flex-1 bg-[#0f1419] border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:border-blue-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              min="0.1"
              max="10"
              step="0.1"
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <div className="text-gray-500 mb-1">Risk Amount</div>
              <div className="text-red-400 font-semibold">${riskAmount.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-gray-500 mb-1">Reward Amount</div>
              <div className="text-emerald-400 font-semibold">${rewardAmount.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-gray-500 mb-1">Take Profit Target</div>
              <div className="text-emerald-400 font-semibold">${takeProfitTarget.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-gray-500 mb-1">Required Win Rate</div>
              <div className="text-blue-400 font-semibold">{requiredWinRate.toFixed(1)}%</div>
            </div>
          </div>
        </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-[#0f1419] rounded-xl p-4 border border-gray-800">
          <div className="text-gray-400 text-xs mb-1">Current Balance</div>
          <div className="text-white text-xl font-bold">${balance.toFixed(2)}</div>
        </div>

        <div className="bg-[#0f1419] rounded-xl p-4 border border-gray-800">
          <div className="text-gray-400 text-xs mb-1">Profit/Loss</div>
          <div className={`text-xl font-bold ${profitLoss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {profitLoss >= 0 ? '+' : ''}${profitLoss.toFixed(2)}
          </div>
        </div>

        <div className="bg-[#0f1419] rounded-xl p-4 border border-gray-800">
          <div className="text-gray-400 text-xs mb-1">Win Rate</div>
          <div className="text-white text-xl font-bold">
            {winRate.toFixed(1)}%
          </div>
        </div>

        <div className="bg-[#0f1419] rounded-xl p-4 border border-gray-800">
          <div className="text-gray-400 text-xs mb-1">Trades</div>
          <div className="text-white text-xl font-bold flex items-center gap-2">
            <span className="text-emerald-400 text-base">{wins}W</span>
            <span className="text-gray-600">/</span>
            <span className="text-red-400 text-base">{losses}L</span>
          </div>
        </div>

        <div className="bg-[#0f1419] rounded-xl p-4 border border-gray-800">
          <div className="text-gray-400 text-xs mb-1">Risk/Trade</div>
          <div className="text-white text-xl font-bold">${riskPerTrade.toFixed(2)}</div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Session Progress</span>
          <span className={`font-semibold ${profitLoss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {profitLossPercent >= 0 ? '+' : ''}{profitLossPercent.toFixed(2)}%
          </span>
        </div>

        <div className="relative h-8 bg-[#0f1419] rounded-xl overflow-hidden border border-gray-800">
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-gray-500 text-xs font-medium">Starting Balance</span>
          </div>

          {profitLoss !== 0 && (
            <div
              className={`absolute top-0 h-full transition-all duration-500 ${
                profitLoss >= 0
                  ? 'bg-gradient-to-r from-emerald-500/30 to-emerald-500/50 border-r-2 border-emerald-500'
                  : 'bg-gradient-to-l from-red-500/30 to-red-500/50 border-l-2 border-red-500'
              }`}
              style={{
                [profitLoss >= 0 ? 'left' : 'right']: '50%',
                width: `${Math.abs(progressPercent) / 2}%`
              }}
            />
          )}

          <div className="absolute left-1/2 top-0 w-0.5 h-full bg-gray-700" />
        </div>

        <div className="flex justify-between text-xs text-gray-500">
          <div className="text-left">
            <div className="text-red-400 font-semibold">Max Drawdown</div>
            <div>${maxDrawdownLimit.toFixed(2)}</div>
          </div>
          <div className="text-right">
            <div className="text-emerald-400 font-semibold">Take Profit</div>
            <div>${takeProfitTarget.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {trades.length > 0 && (
        <div className="mt-6 pt-6 border-t border-gray-800">
          <div className="text-gray-400 text-xs mb-3">Recent Trades</div>
          <div className="flex gap-2 flex-wrap">
            {trades.slice(-10).map((trade) => (
              <div
                key={trade.id}
                className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                  trade.result === 'win'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                }`}
              >
                {trade.result === 'win' ? 'W' : 'L'}
              </div>
            ))}
            {trades.length > 10 && (
              <div className="px-3 py-1 rounded-lg text-xs font-semibold bg-[#0f1419] text-gray-500 border border-gray-800">
                +{trades.length - 10} more
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
