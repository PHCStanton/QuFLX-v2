import { useState } from 'react';
import { TrendingUp, TrendingDown, RotateCcw, Zap } from 'lucide-react';
import VerticalRiskChart from './VerticalRiskChart';

const RISK_REWARD_RATIOS = [
  { label: '1:1', value: 1 },
  { label: '1:1.5', value: 1.5 },
  { label: '1:2', value: 2 },
  { label: '1:3', value: 3 }
];

export default function RiskVisualizationPrototype() {
  const [startingBalance, setStartingBalance] = useState(1000);
  const [currentBalance, setCurrentBalance] = useState(1000);
  const [riskPercentage, setRiskPercentage] = useState(10);
  const [riskRewardRatio, setRiskRewardRatio] = useState(2);
  const [customRatio, setCustomRatio] = useState('');
  const [chartVariant, setChartVariant] = useState<'solid' | 'outlined' | 'glow' | 'dual'>('solid');

  const riskAmount = startingBalance * (riskPercentage / 100);
  const rewardAmount = riskAmount * riskRewardRatio;
  const takeProfitTarget = startingBalance + rewardAmount;
  const maxDrawdownLimit = startingBalance - riskAmount;
  const rewardPercentage = (rewardAmount / startingBalance) * 100;

  const profitLoss = currentBalance - startingBalance;
  const profitLossPercent = (profitLoss / startingBalance) * 100;

  const handleSimulateProfit = (amount: number) => {
    setCurrentBalance(prev => Math.min(prev + amount, takeProfitTarget));
  };

  const handleSimulateLoss = (amount: number) => {
    setCurrentBalance(prev => Math.max(prev - amount, maxDrawdownLimit));
  };

  const handleReset = () => {
    setCurrentBalance(startingBalance);
  };

  const handlePresetScenario = (scenario: 'takeProfit' | 'drawdown' | 'breakEven') => {
    switch (scenario) {
      case 'takeProfit':
        setCurrentBalance(takeProfitTarget);
        break;
      case 'drawdown':
        setCurrentBalance(maxDrawdownLimit);
        break;
      case 'breakEven':
        setCurrentBalance(startingBalance);
        break;
    }
  };

  const handleCustomRatioChange = (value: string) => {
    setCustomRatio(value);
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 10) {
      setRiskRewardRatio(parsed);
    }
  };

  const requiredWinRate = (1 / (1 + riskRewardRatio)) * 100;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-2xl p-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white mb-2">Risk Visualization Prototype</h3>
            <p className="text-gray-300 text-sm leading-relaxed">
              This interactive prototype demonstrates how the risk chart will work in your trading calculator.
              Adjust the controls below to test different scenarios and see how the chart responds in real-time.
              Test different risk/reward ratios, simulate profits and losses, and evaluate the visual design.
            </p>
          </div>
        </div>

        <div className="bg-[#0f1419] border border-purple-500/30 rounded-xl p-4">
          <p className="text-sm text-gray-300">
            <strong className="text-purple-400">Purpose:</strong> Evaluate the chart design, features, and user experience
            before implementing it into the Custom Calculator section. Try different scenarios and provide feedback on what works best.
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="bg-[#1a1f2e] border border-gray-800 rounded-2xl p-6">
            <h4 className="text-white font-semibold mb-4">Configuration</h4>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Starting Balance</label>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 text-lg">$</span>
                  <input
                    type="number"
                    value={startingBalance}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      if (!isNaN(value) && value > 0) {
                        setStartingBalance(value);
                        setCurrentBalance(value);
                      }
                    }}
                    className="flex-1 bg-[#0f1419] border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500 focus:outline-none"
                    min="1"
                    step="0.01"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Max Drawdown Risk (%)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={riskPercentage}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      if (!isNaN(value) && value > 0 && value <= 100) {
                        setRiskPercentage(value);
                        setCurrentBalance(startingBalance);
                      }
                    }}
                    className="flex-1 bg-[#0f1419] border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500 focus:outline-none"
                    min="0.1"
                    max="100"
                    step="0.1"
                  />
                  <span className="text-gray-400 text-lg">%</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">Maximum loss allowed before stopping (recommended: 5-15%)</p>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Risk/Reward Ratio</label>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {RISK_REWARD_RATIOS.map((ratio) => (
                    <button
                      key={ratio.value}
                      onClick={() => {
                        setRiskRewardRatio(ratio.value);
                        setCustomRatio('');
                      }}
                      className={`px-3 py-2 rounded-lg font-semibold transition-all ${
                        riskRewardRatio === ratio.value && !customRatio
                          ? 'bg-emerald-500 text-white'
                          : 'bg-[#0f1419] border border-gray-700 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      {ratio.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 text-sm">Custom:</span>
                  <input
                    type="number"
                    value={customRatio}
                    onChange={(e) => handleCustomRatioChange(e.target.value)}
                    placeholder="e.g., 2.3"
                    className="flex-1 bg-[#0f1419] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-emerald-500 focus:outline-none"
                    min="0.1"
                    max="10"
                    step="0.1"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-gray-700 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Risk Amount ({riskPercentage}%)</span>
                  <span className="text-red-400 font-semibold">${riskAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Reward Amount ({rewardPercentage.toFixed(1)}%)</span>
                  <span className="text-emerald-400 font-semibold">${rewardAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Required Win Rate</span>
                  <span className="text-blue-400 font-semibold">{requiredWinRate.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[#1a1f2e] border border-gray-800 rounded-2xl p-6">
            <h4 className="text-white font-semibold mb-4">Simulation Controls</h4>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Quick Adjustments</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleSimulateProfit(50)}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-all"
                  >
                    <TrendingUp className="w-4 h-4" />
                    +$50
                  </button>
                  <button
                    onClick={() => handleSimulateLoss(50)}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/30 transition-all"
                  >
                    <TrendingDown className="w-4 h-4" />
                    -$50
                  </button>
                  <button
                    onClick={() => handleSimulateProfit(20)}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-all"
                  >
                    <TrendingUp className="w-4 h-4" />
                    +$20
                  </button>
                  <button
                    onClick={() => handleSimulateLoss(20)}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/30 transition-all"
                  >
                    <TrendingDown className="w-4 h-4" />
                    -$20
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Preset Scenarios</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handlePresetScenario('takeProfit')}
                    className="px-3 py-2 bg-[#0f1419] border border-emerald-500/50 text-emerald-400 text-sm rounded-lg hover:bg-emerald-500/10 transition-all"
                  >
                    At Target
                  </button>
                  <button
                    onClick={() => handlePresetScenario('breakEven')}
                    className="px-3 py-2 bg-[#0f1419] border border-gray-700 text-gray-400 text-sm rounded-lg hover:bg-gray-700/30 transition-all"
                  >
                    Break Even
                  </button>
                  <button
                    onClick={() => handlePresetScenario('drawdown')}
                    className="px-3 py-2 bg-[#0f1419] border border-red-500/50 text-red-400 text-sm rounded-lg hover:bg-red-500/10 transition-all"
                  >
                    At Limit
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Manual Input</label>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">$</span>
                  <input
                    type="number"
                    value={currentBalance}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      if (!isNaN(value)) {
                        setCurrentBalance(Math.max(maxDrawdownLimit, Math.min(value, takeProfitTarget)));
                      }
                    }}
                    className="flex-1 bg-[#0f1419] border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                    min={maxDrawdownLimit}
                    max={takeProfitTarget}
                    step="0.01"
                  />
                  <button
                    onClick={handleReset}
                    className="p-2 bg-[#0f1419] border border-gray-700 text-gray-400 rounded-lg hover:border-gray-600 transition-all"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-700">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-400 text-sm">Current Balance</span>
                  <span className="text-white font-bold text-lg">${currentBalance.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Profit/Loss</span>
                  <span className={`font-bold text-lg ${profitLoss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {profitLoss >= 0 ? '+' : ''}${profitLoss.toFixed(2)} ({profitLoss >= 0 ? '+' : ''}{profitLossPercent.toFixed(2)}%)
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[#1a1f2e] border border-gray-800 rounded-2xl p-6">
            <h4 className="text-white font-semibold mb-4">Chart Style Variants</h4>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setChartVariant('solid')}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  chartVariant === 'solid'
                    ? 'bg-purple-500 text-white'
                    : 'bg-[#0f1419] border border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
              >
                Solid Fill
              </button>
              <button
                onClick={() => setChartVariant('outlined')}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  chartVariant === 'outlined'
                    ? 'bg-purple-500 text-white'
                    : 'bg-[#0f1419] border border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
              >
                Outlined
              </button>
              <button
                onClick={() => setChartVariant('glow')}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  chartVariant === 'glow'
                    ? 'bg-purple-500 text-white'
                    : 'bg-[#0f1419] border border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
              >
                Glow Effect
              </button>
              <button
                onClick={() => setChartVariant('dual')}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  chartVariant === 'dual'
                    ? 'bg-purple-500 text-white'
                    : 'bg-[#0f1419] border border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
              >
                Gradient
              </button>
            </div>
          </div>
        </div>

        <div>
          <VerticalRiskChart
            startingBalance={startingBalance}
            currentBalance={currentBalance}
            takeProfitTarget={takeProfitTarget}
            maxDrawdownLimit={maxDrawdownLimit}
            variant={chartVariant}
          />

          <div className="mt-6 bg-[#1a1f2e] border border-gray-800 rounded-2xl p-6">
            <h4 className="text-white font-semibold mb-3">How to Read This Chart</h4>
            <div className="space-y-3 text-sm text-gray-300">
              <div className="flex gap-3">
                <div className="w-3 h-3 bg-emerald-500 rounded-sm mt-1 flex-shrink-0"></div>
                <div>
                  <strong className="text-white">Take Profit Line (Green):</strong> Your profit target based on the risk/reward ratio.
                  When the bar reaches this line, you've hit your session goal.
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-3 h-3 bg-gray-500 rounded-sm mt-1 flex-shrink-0"></div>
                <div>
                  <strong className="text-white">Starting Balance Line (Gray):</strong> Your session starting point (0% reference).
                  The bar extends up for profit or down for loss from this baseline.
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-3 h-3 bg-red-500 rounded-sm mt-1 flex-shrink-0"></div>
                <div>
                  <strong className="text-white">Max Drawdown Line (Red):</strong> Your risk limit ({riskPercentage}% of starting balance).
                  If the bar reaches this line, you should stop trading to preserve capital.
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-3 h-3 bg-gradient-to-b from-emerald-500 to-emerald-600 rounded-sm mt-1 flex-shrink-0"></div>
                <div>
                  <strong className="text-white">The Bar:</strong> Represents your current session position.
                  Green bar = in profit, Red bar = in loss. Height shows distance from starting balance.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
