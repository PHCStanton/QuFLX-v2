import { RiskScenario } from '../lib/risk-calculations';
import { TrendingUp, TrendingDown, Shield } from 'lucide-react';

interface RiskComparisonProps {
  riskComparison: RiskScenario[];
}

export default function RiskComparison({ riskComparison }: RiskComparisonProps) {
  if (riskComparison.length === 0) {
    return null;
  }

  const getStrategyIcon = (strategy: string) => {
    if (strategy === 'Conservative') return <Shield className="w-5 h-5" />;
    if (strategy === 'Aggressive') return <TrendingUp className="w-5 h-5" />;
    return <TrendingDown className="w-5 h-5" />;
  };

  const getStrategyColor = (strategy: string) => {
    if (strategy === 'Conservative') return 'from-blue-500 to-blue-600';
    if (strategy === 'Aggressive') return 'from-red-500 to-red-600';
    return 'from-emerald-500 to-emerald-600';
  };

  return (
    <div className="bg-[#1a1f2e] border border-gray-800 rounded-2xl p-6">
      <h3 className="text-white font-semibold text-xl mb-6">Risk Percentage Comparison</h3>

      <div className="grid md:grid-cols-3 gap-6">
        {riskComparison.map((comparison) => (
          <div
            key={comparison.riskPercent}
            className="bg-[#0f1419] border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-all"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h4 className="text-white text-2xl font-bold">{comparison.riskPercent}% Risk</h4>
                <p className="text-gray-400 text-sm mt-1">{comparison.strategy} Strategy</p>
              </div>
              <div className={`p-3 rounded-xl bg-gradient-to-br ${getStrategyColor(comparison.strategy)}`}>
                {getStrategyIcon(comparison.strategy)}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">Risk per Trade</span>
                <span className="text-white font-semibold">${comparison.riskPerTrade.toFixed(2)}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">Expected Per Session</span>
                <span className="text-emerald-400 font-semibold">+${comparison.expectedSessionProfit.toFixed(2)}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">Max Loss Per Session</span>
                <span className="text-red-400 font-semibold">-${comparison.maxLoss.toFixed(2)}</span>
              </div>

              <div className="pt-4 mt-4 border-t border-gray-800">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Projected Growth</span>
                  <span className={`text-lg font-bold ${comparison.totalGrowth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {comparison.totalGrowth >= 0 ? '+' : ''}{comparison.totalGrowth.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
