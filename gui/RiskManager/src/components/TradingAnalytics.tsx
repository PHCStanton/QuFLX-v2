import { TrendingUp, Target, DollarSign, BarChart3 } from 'lucide-react';
import { Trade, TradingDay } from '../lib/calendar-utils';

interface TradingAnalyticsProps {
  trades: Trade[];
  tradingDays: TradingDay[];
}

export default function TradingAnalytics({ trades, tradingDays }: TradingAnalyticsProps) {
  const calculateWinRate = () => {
    if (trades.length === 0) return 0;
    const wins = trades.filter(t => t.result === 'WIN').length;
    return (wins / trades.length) * 100;
  };

  const calculateTotalProfitLoss = () => {
    return trades.reduce((sum, trade) => sum + trade.profit_loss, 0);
  };

  const calculateGrowthRate = () => {
    if (tradingDays.length === 0) return 0;
    const firstDay = tradingDays[tradingDays.length - 1];
    const lastDay = tradingDays[0];
    if (!firstDay || !lastDay) return 0;

    const startBalance = 1000;
    const endBalance = startBalance + calculateTotalProfitLoss();
    return ((endBalance - startBalance) / startBalance) * 100;
  };

  const calculateProfitability = () => {
    if (trades.length === 0) return 0;
    const totalInvested = trades.reduce((sum, trade) => sum + trade.investment_amount, 0);
    const totalProfit = calculateTotalProfitLoss();
    if (totalInvested === 0) return 0;
    return (totalProfit / totalInvested) * 100;
  };

  const winRate = calculateWinRate();
  const totalPL = calculateTotalProfitLoss();
  const growth = calculateGrowthRate();
  const profitability = calculateProfitability();

  const stats = [
    {
      label: 'Win Rate',
      value: `${winRate.toFixed(1)}%`,
      icon: Target,
      color: winRate >= 60 ? 'emerald' : winRate >= 50 ? 'yellow' : 'red',
      progress: winRate,
    },
    {
      label: 'Total P/L',
      value: `$${totalPL >= 0 ? '+' : ''}${totalPL.toFixed(2)}`,
      icon: DollarSign,
      color: totalPL >= 0 ? 'emerald' : 'red',
      progress: Math.min(Math.abs(totalPL) / 10, 100),
    },
    {
      label: 'Growth',
      value: `${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%`,
      icon: TrendingUp,
      color: growth >= 0 ? 'emerald' : 'red',
      progress: Math.min(Math.abs(growth), 100),
    },
    {
      label: 'Profitability',
      value: `${profitability >= 0 ? '+' : ''}${profitability.toFixed(1)}%`,
      icon: BarChart3,
      color: profitability >= 0 ? 'emerald' : 'red',
      progress: Math.min(Math.abs(profitability), 100),
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <div
            key={index}
            className="bg-[#1a1f2e] border border-gray-800 rounded-2xl p-6 hover:border-gray-700 transition-colors"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`w-12 h-12 bg-gradient-to-br from-${stat.color}-500 to-${stat.color}-600 rounded-xl flex items-center justify-center`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
              <div className={`text-2xl font-bold text-${stat.color}-400`}>
                {stat.value}
              </div>
            </div>

            <div className="mb-3">
              <div className="text-sm font-semibold text-gray-400 mb-2">{stat.label}</div>
              <div className="w-full bg-[#0f1419] rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full bg-gradient-to-r from-${stat.color}-500 to-${stat.color}-600 transition-all duration-500`}
                  style={{ width: `${stat.progress}%` }}
                ></div>
              </div>
            </div>

            <div className="text-xs text-gray-500">
              {stat.label === 'Win Rate' && `${trades.filter(t => t.result === 'WIN').length}/${trades.length} wins`}
              {stat.label === 'Total P/L' && `From ${trades.length} trades`}
              {stat.label === 'Growth' && `Over ${tradingDays.length} days`}
              {stat.label === 'Profitability' && `ROI on investment`}
            </div>
          </div>
        );
      })}
    </div>
  );
}
