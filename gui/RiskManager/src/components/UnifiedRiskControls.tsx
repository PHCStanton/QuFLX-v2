import { useState, useEffect } from 'react';
import { RotateCcw, Target, Settings, BookOpen, User } from 'lucide-react';
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
  payoutPercentage: number;
  useFixedAmount: boolean;
  fixedRiskAmount: number;
  onBalanceChange: (value: number) => void;
  onRiskPercentChange: (value: number) => void;
  onDrawdownPercentChange: (value: number) => void;
  onRiskRewardRatioChange: (value: number) => void;
  onPayoutPercentageChange: (value: number) => void;
  onUseFixedAmountChange: (value: boolean) => void;
  onFixedRiskAmountChange: (value: number) => void;
  onReset: () => void;
  canEditSettings: boolean;
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
  payoutPercentage,
  onRiskRewardRatioChange,
  onPayoutPercentageChange,
  onUseFixedAmountChange,
  onFixedRiskAmountChange,
  onReset,
  canEditSettings
}: UnifiedRiskControlsProps) {
  const [showCheatsheet, setShowCheatsheet] = useState(false);
  
  // Local string states for inputs to allow empty strings while typing
  const [localBalance, setLocalBalance] = useState(initialBalance.toString());
  const [localRiskPercent, setLocalRiskPercent] = useState(riskPercentPerTrade.toString());
  const [localFixedRisk, setLocalFixedRisk] = useState(fixedRiskAmount.toString());
  const [localDrawdown, setLocalDrawdown] = useState(drawdownPercent.toString());
  const [localPayout, setLocalPayout] = useState(payoutPercentage.toString());
  const [localRR, setLocalRR] = useState(riskRewardRatio.toString());

  // Keep local state in sync with props
  useEffect(() => { setLocalBalance(initialBalance.toString()); }, [initialBalance]);
  useEffect(() => { setLocalRiskPercent(riskPercentPerTrade.toString()); }, [riskPercentPerTrade]);
  useEffect(() => { setLocalFixedRisk(fixedRiskAmount.toString()); }, [fixedRiskAmount]);
  useEffect(() => { setLocalDrawdown(drawdownPercent.toString()); }, [drawdownPercent]);
  useEffect(() => { setLocalPayout(payoutPercentage.toString()); }, [payoutPercentage]);
  useEffect(() => { setLocalRR(riskRewardRatio.toString()); }, [riskRewardRatio]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const riskPerTrade = useFixedAmount ? fixedRiskAmount : balance * (riskPercentPerTrade / 100);
  const rewardPerTrade = riskPerTrade * (payoutPercentage / 100);
  const totalDrawdownAmount = initialBalance * (drawdownPercent / 100);
  const takeProfitTarget = initialBalance + (totalDrawdownAmount * riskRewardRatio);
  const requiredWinRate = (1 / (1 + (payoutPercentage / 100))) * 100;

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
          <div className="flex items-center gap-2">
            <h3 className="text-white font-semibold text-lg">Unified Risk Controls</h3>
            <div className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded-full flex items-center gap-1">
              <User className="w-3 h-3 text-blue-400" />
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-tighter">Persona Sync</span>
            </div>
          </div>
          <p className="text-gray-400 text-xs">Global settings for your trading session</p>
        </div>
      </div>

      <div className="flex flex-col gap-5 mb-6">
        <div>
          <label className="flex items-center gap-2 text-gray-400 text-xs mb-2">
            Current Balance
            <Tooltip content="Your starting account balance. This is the total capital you're working with for trading." />
            {!canEditSettings && <span className="text-xs ml-2 text-gray-500">(Reset to edit)</span>}
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
            <input
              type="text"
              inputMode="decimal"
              value={localBalance}
              onChange={(e) => {
                const val = e.target.value.replace(/,/g, '.');
                setLocalBalance(val);
                const parsed = parseFloat(val);
                if (!isNaN(parsed)) {
                  onBalanceChange(parsed);
                }
              }}
              onBlur={() => setLocalBalance(initialBalance.toString())}
              disabled={!canEditSettings}
              className="w-full pl-8 pr-3 py-2 bg-[#0f1419] border border-gray-700 rounded-lg text-white text-sm focus:border-emerald-500 focus:outline-none disabled:opacity-75 disabled:cursor-not-allowed"
              placeholder="1000"
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
                className={`px-2 py-1 rounded text-xs font-semibold transition-all ${
                  !useFixedAmount
                    ? 'bg-emerald-500 text-white'
                    : 'bg-[#0f1419] text-gray-400 border border-gray-700'
                }`}
              >
                %
              </button>
              <button
                onClick={() => onUseFixedAmountChange(true)}
                className={`px-2 py-1 rounded text-xs font-semibold transition-all ${
                  useFixedAmount
                    ? 'bg-emerald-500 text-white'
                    : 'bg-[#0f1419] text-gray-400 border border-gray-700'
                }`}
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
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                      riskPercentPerTrade === percent
                        ? 'bg-emerald-500 text-white'
                        : 'bg-[#0f1419] text-gray-400 border border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    {percent}%
                  </button>
                ))}
              </div>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  value={localRiskPercent}
                  onChange={(e) => {
                    const val = e.target.value.replace(/,/g, '.');
                    setLocalRiskPercent(val);
                    const parsed = parseFloat(val);
                    if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
                      onRiskPercentChange(parsed);
                    }
                  }}
                  onBlur={() => setLocalRiskPercent(riskPercentPerTrade.toString())}
                  placeholder="Custom %"
                  className="w-full px-3 py-2 bg-[#0f1419] border border-gray-700 rounded-lg text-white text-xs placeholder:text-gray-600 focus:border-emerald-500 focus:outline-none"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">%</span>
              </div>
            </>
          ) : (
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={localFixedRisk}
                onChange={(e) => {
                  const val = e.target.value.replace(/,/g, '.');
                  setLocalFixedRisk(val);
                  const parsed = parseFloat(val);
                  if (!isNaN(parsed) && parsed >= 0) {
                    onFixedRiskAmountChange(parsed);
                  }
                }}
                onBlur={() => setLocalFixedRisk(fixedRiskAmount.toString())}
                placeholder="Enter fixed amount"
                className="w-full pl-8 pr-3 py-2 bg-[#0f1419] border border-gray-700 rounded-lg text-white text-sm placeholder:text-gray-600 focus:border-emerald-500 focus:outline-none"
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
              type="text"
              inputMode="decimal"
              value={localDrawdown}
              onChange={(e) => {
                const val = e.target.value.replace(/,/g, '.');
                setLocalDrawdown(val);
                const parsed = parseFloat(val);
                if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
                  onDrawdownPercentChange(parsed);
                }
              }}
              onBlur={() => setLocalDrawdown(drawdownPercent.toString())}
              placeholder="Custom %"
              disabled={!canEditSettings}
              className="w-full px-3 py-2 bg-[#0f1419] border border-gray-700 rounded-lg text-white text-xs placeholder:text-gray-600 focus:border-red-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">%</span>
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-gray-400 text-xs mb-2">
            Payout Percentage
            <Tooltip content="The percentage of your investment that you receive as profit for a winning trade." />
          </label>
          <div className="relative h-[72px] flex items-end">
            <div className="relative w-full">
              <input
                type="text"
                inputMode="decimal"
                value={localPayout}
                onChange={(e) => {
                  const val = e.target.value.replace(/,/g, '.');
                  setLocalPayout(val);
                  const parsed = parseFloat(val);
                  if (!isNaN(parsed) && parsed > 0 && parsed <= 100) {
                    onPayoutPercentageChange(parsed);
                  }
                }}
                onBlur={() => setLocalPayout(payoutPercentage.toString())}
                placeholder="Custom %"
                className="w-full px-3 py-2 bg-[#0f1419] border border-gray-700 rounded-lg text-white text-xs placeholder:text-gray-600 focus:border-blue-500 focus:outline-none"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">%</span>
            </div>
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
        <div className="grid grid-cols-2 gap-2 mb-3">
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
            type="text"
            inputMode="decimal"
            value={localRR}
            onChange={(e) => {
              const val = e.target.value.replace(/,/g, '.');
              setLocalRR(val);
              const parsed = parseFloat(val);
              if (!isNaN(parsed) && parsed > 0 && parsed <= 20) {
                onRiskRewardRatioChange(parsed);
              }
            }}
            onBlur={() => setLocalRR(riskRewardRatio.toString())}
            placeholder="e.g., 2.5"
            disabled={!canEditSettings}
            className="flex-1 bg-[#0f1419] border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:border-blue-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>
        <div className="grid grid-cols-2 gap-4 text-xs mt-2 border-t border-gray-800/50 pt-4">
          <div>
            <div className="flex items-center gap-1 text-gray-500 mb-1">
              Risk/Trade
              <Tooltip content="The amount you'll lose if this trade goes against you." />
            </div>
            <div className="text-red-400 font-semibold">{formatCurrency(riskPerTrade)}</div>
          </div>
          <div>
            <div className="flex items-center gap-1 text-gray-500 mb-1">
              Reward/Trade
              <Tooltip content="The amount you'll gain if this trade is successful, based on your risk/reward ratio." />
            </div>
            <div className="text-emerald-400 font-semibold">{formatCurrency(rewardPerTrade)}</div>
          </div>
          <div>
            <div className="flex items-center gap-1 text-gray-500 mb-1">
              Take Profit Target
              <Tooltip content="Your goal balance if you achieve your drawdown limit in profit. Based on your risk/reward ratio." />
            </div>
            <div className="text-emerald-400 font-semibold">{formatCurrency(takeProfitTarget)}</div>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1 text-gray-500 mb-1">
              Required Win Rate
              <Tooltip content="The minimum percentage of trades you need to win to break even with your current risk/reward ratio." />
            </div>
            <div className="text-blue-400 font-semibold">{requiredWinRate.toFixed(1)}%</div>
          </div>
        </div>
      </div>

      <div className="pt-2">
        <button
          onClick={onReset}
          className="w-full py-3 bg-[#0f1419] hover:bg-gray-800 border border-gray-700 text-gray-400 rounded-xl transition-colors font-medium flex items-center justify-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          Reset Calculator
        </button>
      </div>
    </div>
    </>
  );
}
