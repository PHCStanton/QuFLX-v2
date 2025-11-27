import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, TrendingDown, DollarSign, Target } from 'lucide-react';
import Card from '../components/Card';
import { parsePocketOptionCSV, CSVTrade } from '../lib/csv-parser';

export default function DataVisualizationDemo() {
  const [trades, setTrades] = useState<CSVTrade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCSVData = async () => {
      try {
        const response = await fetch('/src/data/25-11-12Sheet.csv');
        const csvContent = await response.text();
        const parsedTrades = parsePocketOptionCSV(csvContent);
        setTrades(parsedTrades);
      } catch (error) {
        console.error('Error loading CSV:', error);
      } finally {
        setLoading(false);
      }
    };

    loadCSVData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f1419] flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-gray-400">Loading data...</p>
        </div>
      </div>
    );
  }

  const totalTrades = trades.length;
  const winningTrades = trades.filter(t => t.profit > 0).length;
  const losingTrades = trades.filter(t => t.profit < 0).length;
  const tieTrades = trades.filter(t => t.profit === 0).length;
  const winRate = totalTrades > 0 ? ((winningTrades / totalTrades) * 100).toFixed(2) : '0';
  const totalProfit = trades.reduce((sum, t) => sum + t.profit, 0);
  const totalInvestment = trades.reduce((sum, t) => sum + t.tradeAmount, 0);
  const roi = totalInvestment > 0 ? ((totalProfit / totalInvestment) * 100).toFixed(2) : '0';

  const groupedByDate = trades.reduce((acc, trade) => {
    const date = trade.openTime.toISOString().split('T')[0];
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(trade);
    return acc;
  }, {} as Record<string, CSVTrade[]>);

  const dailyStats = Object.entries(groupedByDate).map(([date, dayTrades]) => {
    const profit = dayTrades.reduce((sum, t) => sum + t.profit, 0);
    const wins = dayTrades.filter(t => t.profit > 0).length;
    const losses = dayTrades.filter(t => t.profit < 0).length;
    return { date, trades: dayTrades.length, profit, wins, losses };
  }).sort((a, b) => b.date.localeCompare(a.date));

  const assetPerformance = trades.reduce((acc, trade) => {
    if (!acc[trade.asset]) {
      acc[trade.asset] = { wins: 0, losses: 0, profit: 0, count: 0 };
    }
    acc[trade.asset].count++;
    acc[trade.asset].profit += trade.profit;
    if (trade.profit > 0) acc[trade.asset].wins++;
    if (trade.profit < 0) acc[trade.asset].losses++;
    return acc;
  }, {} as Record<string, { wins: number; losses: number; profit: number; count: number }>);

  const topAssets = Object.entries(assetPerformance)
    .sort((a, b) => b[1].profit - a[1].profit)
    .slice(0, 10);

  const directionStats = {
    call: {
      count: trades.filter(t => t.direction.toLowerCase() === 'call').length,
      profit: trades.filter(t => t.direction.toLowerCase() === 'call').reduce((sum, t) => sum + t.profit, 0),
      wins: trades.filter(t => t.direction.toLowerCase() === 'call' && t.profit > 0).length
    },
    put: {
      count: trades.filter(t => t.direction.toLowerCase() === 'put').length,
      profit: trades.filter(t => t.direction.toLowerCase() === 'put').reduce((sum, t) => sum + t.profit, 0),
      wins: trades.filter(t => t.direction.toLowerCase() === 'put' && t.profit > 0).length
    }
  };

  return (
    <div className="min-h-screen bg-[#0f1419]">
      <div className="border-b border-gray-800 bg-[#1a1f2e]">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Data Analysis</h1>
              <p className="text-gray-400 text-sm">Powerful analytics to visualize and understand your trading performance</p>
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-gray-800 bg-gradient-to-br from-blue-500/10 to-emerald-500/10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <p className="text-blue-400 text-center text-sm">
            <strong>Sample Data Demo:</strong> The charts below show real trading data from a CSV export to demonstrate
            the app's analytical capabilities. Track your own trades in the Trading Calendar to generate similar insights.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">Total Trades</span>
              <Target className="w-5 h-5 text-blue-400" />
            </div>
            <div className="text-3xl font-bold text-white mb-1">{totalTrades}</div>
            <div className="text-sm text-gray-400">
              {winningTrades}W / {losingTrades}L / {tieTrades}T
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">Win Rate</span>
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="text-3xl font-bold text-white mb-1">{winRate}%</div>
            <div className="text-sm text-emerald-400">
              {winningTrades} winning trades
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">Total P/L</span>
              <DollarSign className={`w-5 h-5 ${totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`} />
            </div>
            <div className={`text-3xl font-bold mb-1 ${
              totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}>
              ${totalProfit > 0 ? '+' : ''}{totalProfit.toFixed(2)}
            </div>
            <div className="text-sm text-gray-400">
              ${totalInvestment.toFixed(2)} invested
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">ROI</span>
              <TrendingDown className={`w-5 h-5 ${parseFloat(roi) >= 0 ? 'text-emerald-400' : 'text-red-400'}`} />
            </div>
            <div className={`text-3xl font-bold mb-1 ${
              parseFloat(roi) >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {roi}%
            </div>
            <div className="text-sm text-gray-400">
              Return on investment
            </div>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 mb-8">
          <Card>
            <h3 className="text-xl font-bold text-white mb-4">Daily Performance</h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {dailyStats.map(({ date, trades, profit, wins, losses }) => (
                <div key={date} className="bg-[#0f1419] border border-gray-800 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-white font-semibold">
                      {new Date(date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </div>
                    <div className={`text-lg font-bold ${
                      profit >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      ${profit > 0 ? '+' : ''}{profit.toFixed(2)}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-gray-400">{trades} trades</span>
                    <span className="text-emerald-400">{wins} wins</span>
                    <span className="text-red-400">{losses} losses</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="text-xl font-bold text-white mb-4">Top Performing Assets</h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {topAssets.map(([asset, stats]) => {
                const winRate = stats.count > 0 ? ((stats.wins / stats.count) * 100).toFixed(0) : '0';
                return (
                  <div key={asset} className="bg-[#0f1419] border border-gray-800 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-white font-semibold">{asset}</div>
                      <div className={`text-lg font-bold ${
                        stats.profit >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        ${stats.profit > 0 ? '+' : ''}{stats.profit.toFixed(2)}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-gray-400">{stats.count} trades</span>
                      <span className="text-blue-400">{winRate}% win rate</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-8">
          <Card>
            <h3 className="text-xl font-bold text-white mb-4">Direction Analysis</h3>
            <div className="space-y-4">
              <div className="bg-[#0f1419] border border-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-white font-semibold text-lg">CALL</div>
                  <div className={`text-xl font-bold ${
                    directionStats.call.profit >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    ${directionStats.call.profit > 0 ? '+' : ''}{directionStats.call.profit.toFixed(2)}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-400">{directionStats.call.count} trades</span>
                  <span className="text-emerald-400">{directionStats.call.wins} wins</span>
                  <span className="text-blue-400">
                    {directionStats.call.count > 0
                      ? ((directionStats.call.wins / directionStats.call.count) * 100).toFixed(1)
                      : '0'}% win rate
                  </span>
                </div>
              </div>

              <div className="bg-[#0f1419] border border-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-white font-semibold text-lg">PUT</div>
                  <div className={`text-xl font-bold ${
                    directionStats.put.profit >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    ${directionStats.put.profit > 0 ? '+' : ''}{directionStats.put.profit.toFixed(2)}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-400">{directionStats.put.count} trades</span>
                  <span className="text-emerald-400">{directionStats.put.wins} wins</span>
                  <span className="text-blue-400">
                    {directionStats.put.count > 0
                      ? ((directionStats.put.wins / directionStats.put.count) * 100).toFixed(1)
                      : '0'}% win rate
                  </span>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="text-xl font-bold text-white mb-4">Recent Trades</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {trades.slice(0, 10).map((trade, index) => (
                <div key={index} className="bg-[#0f1419] border border-gray-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-white font-semibold">{trade.asset}</div>
                      <div className="text-xs text-gray-400">
                        {trade.openTime.toLocaleTimeString()} • {trade.direction.toUpperCase()}
                      </div>
                    </div>
                    <div className={`text-right font-bold ${
                      trade.profit > 0 ? 'text-emerald-400' :
                      trade.profit < 0 ? 'text-red-400' : 'text-yellow-400'
                    }`}>
                      ${trade.profit > 0 ? '+' : ''}{trade.profit.toFixed(2)}
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{trade.expiration}</span>
                    <span>${trade.tradeAmount.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
