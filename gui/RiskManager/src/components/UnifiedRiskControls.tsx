import { useState, useEffect } from 'react';
import { Target, Settings, User, DollarSign, Percent } from 'lucide-react';
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
  onReset?: () => void;
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
  canEditSettings
}: UnifiedRiskControlsProps) {
  const [showCheatsheet, setShowCheatsheet] = useState(false);
  
  const [localBalance, setLocalBalance] = useState(initialBalance.toString());
  const [localRiskPercent, setLocalRiskPercent] = useState(riskPercentPerTrade.toString());
  const [localFixedRisk, setLocalFixedRisk] = useState(fixedRiskAmount.toString());
  const [localDrawdown, setLocalDrawdown] = useState(drawdownPercent.toString());
  const [localPayout, setLocalPayout] = useState(payoutPercentage.toString());
  const [localRR, setLocalRR] = useState(riskRewardRatio.toString());

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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
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
            <p className="text-gray-400 text-xs whitespace-nowrap">Global settings for your trading session</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Row 1: Balance & Payout */}
        <div className="flex flex-col gap-4 bg-[#0f1419] p-4 rounded-xl border border-gray-800/50">
           <div className="flex items-center gap-2 text-gray-400 text-[10px] uppercase tracking-wider font-bold">
            <DollarSign className="w-3 h-3" />
            Account & Payout
          </div>
          
          <div>
            <label className="flex items-center gap-2 text-gray-500 text-[10px] uppercase font-semibold mb-1.5 ml-1">
              Initial Balance
              <Tooltip content="Your starting account balance." />
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={localBalance}
                onChange={(e) => {
                  const val = e.target.value.replace(/,/g, '.');
                  setLocalBalance(val);
                  const parsed = parseFloat(val);
                  if (!isNaN(parsed)) onBalanceChange(parsed);
                }}
                onBlur={() => setLocalBalance(initialBalance.toString())}
                disabled={!canEditSettings}
                className="w-full pl-7 pr-3 py-2 bg-[#1a1f2e] border border-gray-700 rounded-lg text-white text-sm focus:border-emerald-500 focus:outline-none disabled:opacity-50"
              />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-gray-500 text-[10px] uppercase font-semibold mb-1.5 ml-1">
              Payout (%)
              <Tooltip content="Profit percentage for winning trades." />
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                value={localPayout}
                onChange={(e) => {
                  const val = e.target.value.replace(/,/g, '.');
                  setLocalPayout(val);
                  const parsed = parseFloat(val);
                  if (!isNaN(parsed) && parsed > 0 && parsed <= 100) onPayoutPercentageChange(parsed);
                }}
                onBlur={() => setLocalPayout(payoutPercentage.toString())}
                className="w-full px-3 py-2 bg-[#1a1f2e] border border-gray-700 rounded-lg text-white text-sm focus:border-emerald-500 focus:outline-none"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">%</span>
            </div>
          </div>
        </div>

        {/* Row 2: Risk Settings */}
        <div className="flex flex-col gap-4 bg-[#0f1419] p-4 rounded-xl border border-gray-800/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-gray-400 text-[10px] uppercase tracking-wider font-bold">
              <Percent className="w-3 h-3" />
              Risk Strategy
            </div>
            <div className="flex bg-[#1a1f2e] rounded-lg p-0.5 border border-gray-700">
              <button
                onClick={() => onUseFixedAmountChange(false)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${!useFixedAmount ? 'bg-emerald-500 text-white' : 'text-gray-500'}`}
              >
                %
              </button>
              <button
                onClick={() => onUseFixedAmountChange(true)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${useFixedAmount ? 'bg-emerald-500 text-white' : 'text-gray-500'}`}
              >
                $
              </button>
            </div>
          </div>

          {!useFixedAmount ? (
            <div className="flex flex-col gap-2">
              <div className="flex gap-1.5">
                {[1, 5, 10].map((percent) => (
                  <button
                    key={percent}
                    onClick={() => onRiskPercentChange(percent)}
                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${riskPercentPerTrade === percent ? 'bg-emerald-500 text-white' : 'bg-[#1a1f2e] text-gray-400 border border-gray-700'}`}
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
                    if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) onRiskPercentChange(parsed);
                  }}
                  onBlur={() => setLocalRiskPercent(riskPercentPerTrade.toString())}
                  className="w-full px-3 py-2 bg-[#1a1f2e] border border-gray-700 rounded-lg text-white text-sm focus:border-emerald-500 focus:outline-none"
                  placeholder="Custom %"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">%</span>
              </div>
            </div>
          ) : (
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={localFixedRisk}
                onChange={(e) => {
                  const val = e.target.value.replace(/,/g, '.');
                  setLocalFixedRisk(val);
                  const parsed = parseFloat(val);
                  if (!isNaN(parsed) && parsed >= 0) onFixedRiskAmountChange(parsed);
                }}
                onBlur={() => setLocalFixedRisk(fixedRiskAmount.toString())}
                className="w-full pl-7 pr-3 py-2 bg-[#1a1f2e] border border-gray-700 rounded-lg text-white text-sm focus:border-emerald-500 focus:outline-none"
                placeholder="Fixed amount"
              />
            </div>
          )}

          <div>
            <label className="flex items-center gap-2 text-gray-500 text-[10px] uppercase font-semibold mb-1.5 ml-1">
              Drawdown (%)
              <Tooltip content="Maximum account loss limit." />
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                value={localDrawdown}
                onChange={(e) => {
                  const val = e.target.value.replace(/,/g, '.');
                  setLocalDrawdown(val);
                  const parsed = parseFloat(val);
                  if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) onDrawdownPercentChange(parsed);
                }}
                onBlur={() => setLocalDrawdown(drawdownPercent.toString())}
                disabled={!canEditSettings}
                className="w-full px-3 py-2 bg-[#1a1f2e] border border-gray-700 rounded-lg text-white text-sm focus:border-red-500 focus:outline-none disabled:opacity-50"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">%</span>
            </div>
          </div>
        </div>

        {/* Row 3: Risk/Reward Summary */}
        <div className="flex flex-col h-full bg-[#0f1419] p-4 rounded-xl border border-gray-800/50 lg:col-span-1 md:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-gray-400 text-[10px] uppercase tracking-wider font-bold">
              <Target className="w-3 h-3" />
              R/R Targets
            </div>
            <button
              onClick={() => setShowCheatsheet(true)}
              className="text-[10px] font-bold text-blue-400 hover:text-blue-300 transition-colors uppercase"
            >
              Cheatsheet
            </button>
          </div>
          
          <div className="flex flex-col gap-3 mb-4">
             <div className="flex flex-col">
              <span className="text-gray-500 text-[9px] uppercase font-bold mb-1.5 ml-1">Risk/Reward</span>
              <div className="grid grid-cols-4 gap-1 mb-2">
                {RISK_REWARD_RATIOS.map((ratio) => (
                  <button
                    key={ratio.value}
                    onClick={() => onRiskRewardRatioChange(ratio.value)}
                    disabled={!canEditSettings}
                    className={`py-1.5 rounded-lg font-bold transition-all text-[10px] ${
                      riskRewardRatio === ratio.value && canEditSettings
                        ? 'bg-blue-500 text-white'
                        : 'bg-[#1a1f2e] border border-gray-700 text-gray-400'
                    } ${!canEditSettings ? 'opacity-50 cursor-not-allowed' : 'hover:border-gray-600'}`}
                  >
                    {ratio.label}
                  </button>
                ))}
              </div>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  value={localRR}
                  onChange={(e) => {
                    const val = e.target.value.replace(/,/g, '.');
                    setLocalRR(val);
                    const parsed = parseFloat(val);
                    if (!isNaN(parsed) && parsed > 0 && parsed <= 20) onRiskRewardRatioChange(parsed);
                  }}
                  onBlur={() => setLocalRR(riskRewardRatio.toString())}
                  disabled={!canEditSettings}
                  placeholder="Custom RR"
                  className="w-full bg-[#1a1f2e] border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:border-blue-500 focus:outline-none disabled:opacity-50"
                />
              </div>
            </div>
            <div className="flex items-center justify-between px-1">
              <span className="text-gray-500 text-[9px] uppercase font-bold">Min Win Rate</span>
              <div className="text-blue-400 text-xs font-bold">{requiredWinRate.toFixed(1)}%</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-auto pt-3 border-t border-gray-800">
            <div className="flex flex-col">
               <span className="text-gray-500 text-[9px] uppercase font-bold whitespace-nowrap">Risk/Trade</span>
               <span className="text-red-400 text-xs font-bold">{formatCurrency(riskPerTrade)}</span>
            </div>
            <div className="flex flex-col">
               <span className="text-gray-500 text-[9px] uppercase font-bold whitespace-nowrap">Profit Goal</span>
               <span className="text-emerald-400 text-xs font-bold">{formatCurrency(takeProfitTarget - initialBalance)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
