import { useState } from 'react';
import { TrendingUp, TrendingDown, RotateCcw, Target, Settings, BookOpen } from 'lucide-react';
import RiskRewardCheatsheetModal from './RiskRewardCheatsheetModal';
import Tooltip from './Tooltip';

const RISK_REWARD_RATIOS = [
  { label: '1:1', value: 1 },
  { label: '1:1.5', value: 1.5 },
  { label: '1:2', value: 2 },
  { label: '1:3', value: 3 }
];

interface UnifiedRiskControlsProps {
  balance: number;
  initialBalance: number;
  riskPercentPerTrade: number;
  drawdownPercent: number;
  riskRewardRatio: number;
  useFixedAmount: boolean;
  fixedRiskAmount: number;
  onBalanceChange: (value: number) => void;
  onRiskPercentChange: (value: number) => void;
  onDrawdownPercentChange: (value: number) => void;
  onRiskRewardRatioChange: (value: number) => void;
  onUseFixedAmountChange: (value: boolean) => void;
  onFixedRiskAmountChange: (value: number) => void;
  onAddTrade: (result: 'win' | 'loss') => void;
  onReset: () => void;
  canEditSettings: boolean;
  isLinked: boolean;
}

export default function UnifiedRiskControls({
  balance,
  initialBalance,
  riskPercentPerTrade,
  drawdownPercent,
  riskRewardRatio,
  useFixedAmount,
  fixedRiskAmount,
  onBalanceChange,
  onRiskPercentChange,
  onDrawdownPercentChange,
  onRiskRewardRatioChange,
  onUseFixedAmountChange,
  onFixedRiskAmountChange,
  onAddTrade,
  onReset,
  canEditSettings,
  isLinked
}: UnifiedRiskControlsProps) {
  const [showCheatsheet, setShowCheatsheet] = useState(false);

  const riskPerTrade = useFixedAmount ? fixedRiskAmount : balance * (riskPercentPerTrade / 100);
  const rewardPerTrade = riskPerTrade * riskRewardRatio;
  const totalDrawdownAmount = initialBalance * (drawdownPercent / 100);
  const maxDrawdownLimit = initialBalance - totalDrawdownAmount;
  const takeProfitTarget = initialBalance + (totalDrawdownAmount * riskRewardRatio);
  const requiredWinRate = (1 / (1 + riskRewardRatio)) * 100;

  return (
    <>
    <RiskRewardCheatsheetModal
      isOpen={showCheatsheet}
      onClose={() => setShowCheatsheet(false)}
    />
    <div className="bg-[#1a1f2e] border border-gray-800 rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center">
          <Settings className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="text-white font-semibold text-lg">Unified Risk Controls</h3>
          <p className="text-gray-400 text-xs">Global settings for your trading session</p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="flex items-center gap-2 text-gray-400 text-xs mb-2">
            Current Balance
            <Tooltip content="Your starting account balance. This is the total capital you're working with for trading." />
            {!canEditSettings && <span className="text-xs ml-2 text-gray-500">(Reset to edit)</span>}
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
            <input
              type="number"
              value={initialBalance}
              onChange={(e) => {
                const value = parseFloat(e.target.value);
                if (!isNaN(value) && value > 0) {
                  onBalanceChange(value);
                }
              }}
              disabled={!canEditSettings}
              className="w-full pl-8 pr-3 py-2 bg-[#0f1419] border border-gray-700 rounded-lg text-white text-sm focus:border-emerald-500 focus:outline-none disabled:opacity-75 disabled:cursor-not-allowed"
              placeholder="1000"
              min="1"
              step="0.01"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-2 text-gray-400 text-xs">
              Risk Per Trade
              <Tooltip content="The amount you're willing to risk on each trade. You can use a percentage of your balance or a fixed dollar amount." />
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onUseFixedAmountChange(false)}
                disabled={!canEditSettings}
                className={`px-2 py-1 rounded text-xs font-semibold transition-all ${
                  !useFixedAmount && canEditSettings
                    ? 'bg-emerald-500 text-white'
                    : 'bg-[#0f1419] text-gray-400 border border-gray-700'
                } ${!canEditSettings ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                %
              </button>
              <button
                onClick={() => onUseFixedAmountChange(true)}
                disabled={!canEditSettings}
                className={`px-2 py-1 rounded text-xs font-semibold transition-all ${
                  useFixedAmount && canEditSettings
                    ? 'bg-emerald-500 text-white'
                    : 'bg-[#0f1419] text-gray-400 border border-gray-700'
                } ${!canEditSettings ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                $
              </button>
            </div>
          </div>

          {!useFixedAmount ? (
            <>
              <div className="flex gap-2 mb-2">
                {[1, 5, 10].map((percent) => (
                  <button
                    key={percent}
                    onClick={() => onRiskPercentChange(percent)}
                    disabled={!canEditSettings}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                      riskPercentPerTrade === percent && canEditSettings
                        ? 'bg-emerald-500 text-white'
                        : 'bg-[#0f1419] text-gray-400 border border-gray-700'
                    } ${!canEditSettings ? 'opacity-50 cursor-not-allowed' : 'hover:border-gray-600'}`}
                  >
                    {percent}%
                  </button>
                ))}
              </div>
              <div className="relative">
                <input
                  type="number"
                  value={riskPercentPerTrade}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value);
                    if (!isNaN(value) && value >= 0 && value <= 100) {
                      onRiskPercentChange(value);
                    }
                  }}
                  placeholder="Custom %"
                  disabled={!canEditSettings}
                  className="w-full px-3 py-2 bg-[#0f1419] border border-gray-700 rounded-lg text-white text-xs placeholder:text-gray-600 focus:border-emerald-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  min="0.01"
                  max="100"
                  step="0.1"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">%</span>
              </div>
            </>
          ) : (
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                value={fixedRiskAmount}
                onChange={(e) => {
                  const value = parseFloat(e.target.value);
                  if (!isNaN(value) && value >= 0) {
                    onFixedRiskAmountChange(value);
                  }
                }}
                placeholder="Enter fixed amount"
                disabled={!canEditSettings}
                className="w-full pl-8 pr-3 py-2 bg-[#0f1419] border border-gray-700 rounded-lg text-white text-sm placeholder:text-gray-600 focus:border-emerald-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                min="0.01"
                step="0.01"
              />
            </div>
          )}
        </div>

        <div>
          <label className="flex items-center gap-2 text-gray-400 text-xs mb-2">
            Total Drawdown Limit (%)
            <Tooltip content="The maximum percentage loss you're willing to accept before stopping. For example, 10% means you'll stop if your balance drops to 90% of your starting amount." />
          </label>
          <div className="flex gap-2 mb-2">
            {[5, 10, 20].map((percent) => (
              <button
                key={percent}
                onClick={() => onDrawdownPercentChange(percent)}
                disabled={!canEditSettings}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                  drawdownPercent === percent && canEditSettings
                    ? 'bg-red-500 text-white'
                    : 'bg-[#0f1419] text-gray-400 border border-gray-700'
                } ${!canEditSettings ? 'opacity-50 cursor-not-allowed' : 'hover:border-gray-600'}`}
              >
                {percent}%
              </button>
            ))}
          </div>
          <div className="relative">
            <input
              type="number"
              value={drawdownPercent}
              onChange={(e) => {
                const value = parseFloat(e.target.value);
                if (!isNaN(value) && value >= 0 && value <= 100) {
                  onDrawdownPercentChange(value);
                }
              }}
              placeholder="Custom %"
              disabled={!canEditSettings}
              className="w-full px-3 py-2 bg-[#0f1419] border border-gray-700 rounded-lg text-white text-xs placeholder:text-gray-600 focus:border-red-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              min="0.01"
              max="100"
              step="0.1"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">%</span>
          </div>
        </div>
      </div>

      <div className="bg-[#0f1419] border border-gray-800 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-blue-400" />
            <label className="flex items-center gap-2 text-gray-400 text-sm font-medium">
              Risk/Reward Ratio
              <Tooltip content="How much you can win compared to what you risk. A 1:2 ratio means you risk $1 to potentially make $2. Higher ratios mean you need fewer wins to be profitable." />
            </label>
          </div>
          <button
            onClick={() => setShowCheatsheet(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 hover:border-blue-500/50 text-blue-400 rounded-lg transition-colors text-xs font-medium"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Cheatsheet
          </button>
        </div>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {RISK_REWARD_RATIOS.map((ratio) => (
            <button
              key={ratio.value}
              onClick={() => onRiskRewardRatioChange(ratio.value)}
              disabled={!canEditSettings}
              className={`px-3 py-2 rounded-lg font-semibold transition-all text-xs ${
                riskRewardRatio === ratio.value && canEditSettings
                  ? 'bg-blue-500 text-white'
                  : 'bg-[#0f1419] border border-gray-700 text-gray-400'
              } ${!canEditSettings ? 'opacity-50 cursor-not-allowed' : 'hover:border-gray-600'}`}
            >
              {ratio.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-gray-400 text-xs">Custom:</span>
          <input
            type="number"
            value={riskRewardRatio}
            onChange={(e) => {
              const value = parseFloat(e.target.value);
              if (!isNaN(value) && value > 0 && value <= 10) {
                onRiskRewardRatioChange(value);
              }
            }}
            placeholder="e.g., 2.5"
            disabled={!canEditSettings}
            className="flex-1 bg-[#0f1419] border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:border-blue-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            min="0.1"
            max="10"
            step="0.1"
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <div className="flex items-center gap-1 text-gray-500 mb-1">
              Risk/Trade
              <Tooltip content="The amount you'll lose if this trade goes against you." />
            </div>
            <div className="text-red-400 font-semibold">${riskPerTrade.toFixed(2)}</div>
          </div>
          <div>
            <div className="flex items-center gap-1 text-gray-500 mb-1">
              Reward/Trade
              <Tooltip content="The amount you'll gain if this trade is successful, based on your risk/reward ratio." />
            </div>
            <div className="text-emerald-400 font-semibold">${rewardPerTrade.toFixed(2)}</div>
          </div>
          <div>
            <div className="flex items-center gap-1 text-gray-500 mb-1">
              Take Profit Target
              <Tooltip content="Your goal balance if you achieve your drawdown limit in profit. Based on your risk/reward ratio." />
            </div>
            <div className="text-emerald-400 font-semibold">${takeProfitTarget.toFixed(2)}</div>
          </div>
          <div>
            <div className="flex items-center gap-1 text-gray-500 mb-1">
              Required Win Rate
              <Tooltip content="The minimum percentage of trades you need to win to break even with your current risk/reward ratio." />
            </div>
            <div className="text-blue-400 font-semibold">{requiredWinRate.toFixed(1)}%</div>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => onAddTrade('win')}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl transition-colors font-medium"
        >
          <TrendingUp className="w-4 h-4" />
          Add Win
        </button>
        <button
          onClick={() => onAddTrade('loss')}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors font-medium"
        >
          <TrendingDown className="w-4 h-4" />
          Add Loss
        </button>
        <button
          onClick={onReset}
          className="px-6 py-3 bg-[#0f1419] hover:bg-gray-800 border border-gray-700 text-gray-400 rounded-xl transition-colors font-medium"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
    </div>
    </>
  );
}
