import React, { useState } from 'react';
import { 
  BarChart3, TrendingUp, TrendingDown, DollarSign, Target, 
  Upload, Clock, Flame, Activity, Info, FileSpreadsheet
} from 'lucide-react';
import Card from '../components/Card';
import { CSVTrade } from '../lib/csv-parser';
import { parsePocketOptionExcel, parseUploadedCSV } from '../lib/excel-parser';

export default function DataVisualizationDemo() {
  const [trades, setTrades] = useState<CSVTrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setUploadError(null);
    const file = e.dataTransfer.files[0];
    if (file) await handleFileUpload(file);
  };

  const onFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (file) await handleFileUpload(file);
  };

  const handleFileUpload = async (file: File) => {
    try {
      setLoading(true);
      let parsedTrades: CSVTrade[] = [];
      if (file.name.endsWith('.xlsx')) {
        parsedTrades = await parsePocketOptionExcel(file);
      } else if (file.name.endsWith('.csv')) {
        parsedTrades = await parseUploadedCSV(file);
      } else {
        throw new Error('Unsupported file format. Please upload .xlsx or .csv');
      }
      
      if (parsedTrades.length === 0) {
        throw new Error('No trades found or invalid file format.');
      }
      
      setTrades(parsedTrades);
    } catch (err: any) {
      setUploadError(err.message || 'Error processing file');
      setTrades([]);
    } finally {
      setLoading(false);
    }
  };

  // If no trades, show the upload screen
  if (trades.length === 0) {
    return (
      <div className="min-h-screen bg-[#0f1419] flex flex-col items-center justify-center p-6">
        <div className="max-w-xl w-full">
          <div className="flex items-center gap-4 mb-8 justify-center">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <BarChart3 className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Data Analysis</h1>
              <p className="text-gray-400">Upload your Pocket Option statement</p>
            </div>
          </div>

          <div 
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`border-2 border-dashed rounded-3xl p-12 text-center transition-all ${
              isDragging 
                ? 'border-blue-500 bg-blue-500/10 scale-105' 
                : 'border-gray-700 bg-[#1a1f2e] hover:border-blue-500/50 hover:bg-[#1f2536]'
            }`}
          >
            {loading ? (
              <div className="flex flex-col items-center">
                <div className="inline-block w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-xl text-white font-semibold">Processing Data...</p>
                <p className="text-gray-400 mt-2">Parsing trading history securely</p>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div className="w-20 h-20 bg-[#0f1419] rounded-2xl flex items-center justify-center mb-6 shadow-inner">
                  <FileSpreadsheet className="w-10 h-10 text-blue-400" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Drag & Drop Statement</h3>
                <p className="text-gray-400 mb-8 max-w-sm">
                  Upload your .xlsx or .csv statement directly exported from Pocket Option
                </p>
                <label className="cursor-pointer bg-blue-500 hover:bg-blue-600 text-white px-8 py-3 rounded-xl font-semibold transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2">
                  <Upload className="w-5 h-5" />
                  Select File
                  <input type="file" className="hidden" accept=".xlsx,.csv" onChange={onFileInput} />
                </label>
                {uploadError && (
                  <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 font-medium">
                    {uploadError}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- Metrics Calculation ---
  const totalTrades = trades.length;
  const wins = trades.filter(t => t.profit > 0);
  const losses = trades.filter(t => t.profit < 0);
  const tieTrades = trades.filter(t => t.profit === 0).length;
  
  const winningTradesCount = wins.length;
  const losingTradesCount = losses.length;
  
  const winRate = totalTrades > 0 ? ((winningTradesCount / totalTrades) * 100).toFixed(2) : '0';
  const totalProfit = trades.reduce((sum, t) => sum + t.profit, 0);
  const totalInvestment = trades.reduce((sum, t) => sum + t.tradeAmount, 0);

  // Binary Option Specific Metrics
  const avgWin = winningTradesCount ? wins.reduce((sum, t) => sum + t.profit, 0) / winningTradesCount : 0;
  // Use tradeAmount as absolute loss value since profit might be negative
  const avgLoss = losingTradesCount ? losses.reduce((sum, t) => sum + t.tradeAmount, 0) / losingTradesCount : 0;
  
  // Streaks Analysis
  const sortedTrades = [...trades].sort((a, b) => a.openTime.getTime() - b.openTime.getTime());
  let currentWinStreak = 0;
  let maxWinStreak = 0;
  let currentLossStreak = 0;
  let maxLossStreak = 0;

  sortedTrades.forEach(trade => {
    if (trade.profit > 0) {
      currentWinStreak++;
      currentLossStreak = 0;
      if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak;
    } else if (trade.profit < 0) {
      currentLossStreak++;
      currentWinStreak = 0;
      if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;
    } else {
      currentWinStreak = 0;
      currentLossStreak = 0;
    }
  });

  // Time-of-Day Performance
  const timeOfDayMap = Array.from({ length: 24 }, (_, hour) => {
    const hourTrades = sortedTrades.filter(t => t.openTime.getHours() === hour);
    const profit = hourTrades.reduce((sum, t) => sum + t.profit, 0);
    const w = hourTrades.filter(t => t.profit > 0).length;
    return { hour, trades: hourTrades.length, profit, wins: w };
  }).filter(h => h.trades > 0);

  const bestHour = [...timeOfDayMap].sort((a, b) => b.profit - a.profit)[0] || null;

  // Daily Stats
  const groupedByDate = trades.reduce((acc, trade) => {
    const date = trade.openTime.toISOString().split('T')[0];
    if (!acc[date]) acc[date] = [];
    acc[date].push(trade);
    return acc;
  }, {} as Record<string, CSVTrade[]>);

  const dailyStats = Object.entries(groupedByDate).map(([date, dayTrades]) => {
    const profit = dayTrades.reduce((sum, t) => sum + t.profit, 0);
    const dayWins = dayTrades.filter(t => t.profit > 0).length;
    const dayLosses = dayTrades.filter(t => t.profit < 0).length;
    return { date, trades: dayTrades.length, profit, wins: dayWins, losses: dayLosses };
  }).sort((a, b) => b.date.localeCompare(a.date));

  // Assets Performance
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

  // Direction Performance
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
      {/* Header */}
      <div className="border-b border-gray-800 bg-[#1a1f2e] sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Risk Data Analysis</h1>
              <p className="text-gray-400 text-sm">Reviewing {totalTrades} parsed trades</p>
            </div>
          </div>
          <button 
            onClick={() => setTrades([])}
            className="px-4 py-2 bg-[#0f1419] border border-gray-700 hover:border-blue-500 hover:text-blue-400 rounded-xl text-gray-400 font-semibold transition-all text-sm flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Upload New
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Core KPI Row */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="bg-[#1a1f2e] border-gray-800 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Target className="w-16 h-16 text-blue-500" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm font-semibold tracking-wider">WIN RATE</span>
              </div>
              <div className="text-4xl font-black text-white mb-2">{winRate}%</div>
              <div className="text-sm font-medium text-gray-400">
                <span className="text-emerald-400">{winningTradesCount}W</span> /&nbsp;
                <span className="text-red-400">{losingTradesCount}L</span> /&nbsp;
                <span className="text-yellow-400">{tieTrades}T</span>
              </div>
            </div>
          </Card>

          <Card className="bg-[#1a1f2e] border-gray-800 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <DollarSign className="w-16 h-16 text-emerald-500" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm font-semibold tracking-wider">NET PROFIT</span>
              </div>
              <div className={`text-4xl font-black mb-2 ${totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                ${totalProfit > 0 ? '+' : ''}{totalProfit.toFixed(2)}
              </div>
              <div className="text-sm font-medium text-gray-400">
                ${totalInvestment.toFixed(2)} total volume
              </div>
            </div>
          </Card>

          <Card className="bg-[#1a1f2e] border-gray-800 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Activity className="w-16 h-16 text-purple-500" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm font-semibold tracking-wider">AVG RISK / REWARD</span>
              </div>
              <div className="text-2xl font-bold text-white mb-3">
                <span className="text-emerald-400">+${avgWin.toFixed(2)}</span>
                <span className="text-gray-600 mx-2">/</span>
                <span className="text-red-400">-${avgLoss.toFixed(2)}</span>
              </div>
              <div className="text-sm font-medium text-gray-400">
                Avg Profit vs Avg Risk
              </div>
            </div>
          </Card>

          <Card className="bg-[#1a1f2e] border-gray-800 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Flame className="w-16 h-16 text-orange-500" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm font-semibold tracking-wider">MAX STREAKS</span>
              </div>
              <div className="text-2xl font-bold text-white mb-3 flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <TrendingUp className="w-5 h-5" />
                  {maxWinStreak}
                </div>
                <div className="flex items-center gap-1.5 text-red-400">
                  <TrendingDown className="w-5 h-5" />
                  {maxLossStreak}
                </div>
              </div>
              <div className="text-sm font-medium text-gray-400">
                Consecutive Wins vs Losses
              </div>
            </div>
          </Card>
        </div>

        {/* Binary Options Metrics Row */}
        <div className="grid lg:grid-cols-3 gap-8 mb-8">
          <Card className="lg:col-span-1 border-gray-800 bg-[#1a1f2e]">
            <div className="flex items-center gap-2 mb-6">
              <Clock className="w-5 h-5 text-blue-400" />
              <h3 className="text-lg font-bold text-white">Best Session Time</h3>
            </div>
            {bestHour ? (
              <div className="flex flex-col items-center justify-center p-6 bg-[#0f1419] border border-gray-800 rounded-2xl">
                <div className="text-5xl font-black text-white mb-2">
                  {bestHour.hour.toString().padStart(2, '0')}:00
                </div>
                <div className="text-emerald-400 font-semibold mb-4 text-lg">
                  +${bestHour.profit.toFixed(2)} Profit
                </div>
                <div className="text-sm text-gray-400 font-medium">
                  {bestHour.trades} trades placed this hour
                </div>
                <div className="mt-4 w-full h-1 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500" style={{ width: `${(bestHour.wins / bestHour.trades) * 100}%` }}></div>
                </div>
                <div className="w-full text-center mt-2 text-xs text-gray-500 font-bold uppercase tracking-wider">
                  {((bestHour.wins / bestHour.trades) * 100).toFixed(0)}% Win Rate
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-500 p-6">Not enough data</div>
            )}
          </Card>

          <Card className="lg:col-span-2 border-gray-800 bg-[#1a1f2e]">
            <h3 className="text-lg font-bold text-white mb-6">Performance by Time-of-Day</h3>
            <div className="h-48 flex items-end gap-2">
              {timeOfDayMap.sort((a, b) => a.hour - b.hour).map(({ hour, profit }) => {
                const maxAbsProfit = Math.max(...timeOfDayMap.map(h => Math.abs(h.profit)));
                const normalizedHeight = maxAbsProfit > 0 ? (Math.abs(profit) / maxAbsProfit) * 100 : 0;
                
                return (
                  <div key={hour} className="flex-1 flex flex-col justify-end items-center group relative h-full">
                    {/* Tooltip */}
                    <div className="absolute -top-12 bg-gray-800 text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10 shadow-lg shadow-black/50">
                      {hour.toString().padStart(2, '0')}:00 - ${profit.toFixed(2)}
                    </div>
                    {/* Bar container centers the bar based on positive/negative logic conceptually */}
                    {/* For visual simplicity we project upward, using color to denote profit/loss */}
                    <div 
                      className={`w-full max-w-[20px] rounded-t-sm transition-all ${
                        profit >= 0 ? 'bg-emerald-500 hover:bg-emerald-400' : 'bg-red-500 hover:bg-red-400'
                      }`}
                      style={{ height: `${Math.max(normalizedHeight, 2)}%` }} // Minimum height of 2% for visibility
                    />
                    <div className="text-[10px] text-gray-500 mt-2 font-mono">
                      {hour.toString().padStart(2, '0')}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-center gap-6 mt-4 pt-4 border-t border-gray-800">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                <span className="text-xs text-gray-400 font-medium">Net Profitable Hour</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span className="text-xs text-gray-400 font-medium">Net Losing Hour</span>
              </div>
            </div>
          </Card>
        </div>

        {/* Existing Grid Repurposed: Setup + Assets */}
        <div className="grid lg:grid-cols-2 gap-8 mb-8">
          <Card className="border-gray-800 bg-[#1a1f2e]">
            <div className="flex items-center justify-between mb-6">
               <h3 className="text-lg font-bold text-white">Top Performing Assets</h3>
               <span className="px-3 py-1 bg-blue-500/10 text-blue-400 rounded-full text-xs font-bold uppercase tracking-wider">Top 10</span>
            </div>
            <div className="space-y-3 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
              {topAssets.map(([asset, stats], idx) => {
                const wr = stats.count > 0 ? ((stats.wins / stats.count) * 100).toFixed(0) : '0';
                return (
                  <div key={asset} className="bg-[#0f1419] border border-gray-800 rounded-xl p-4 flex items-center justify-between hover:border-gray-600 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-sm font-bold text-gray-400">
                        {idx + 1}
                      </div>
                      <div>
                        <div className="text-white font-bold">{asset}</div>
                        <div className="text-xs text-gray-500 font-medium">{stats.count} trades</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-black ${stats.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        ${stats.profit > 0 ? '+' : ''}{stats.profit.toFixed(2)}
                      </div>
                      <div className="text-xs text-blue-400 font-bold uppercase tracking-wider">{wr}% WR</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="space-y-8">
            <Card className="border-gray-800 bg-[#1a1f2e]">
              <h3 className="text-lg font-bold text-white mb-6">Direction Edge</h3>
              <div className="space-y-4">
                <div className="bg-[#0f1419] border border-gray-800 rounded-xl p-5 relative overflow-hidden group">
                  <div className="absolute -right-4 -top-4 text-gray-800/20 group-hover:text-gray-800/40 transition-colors">
                    <TrendingUp className="w-32 h-32" />
                  </div>
                  <div className="relative z-10 flex items-center justify-between">
                    <div>
                      <div className="text-white font-black text-2xl tracking-wider mb-1">CALL</div>
                      <div className="flex items-center gap-3 text-sm font-medium">
                        <span className="text-emerald-400">{directionStats.call.wins}W</span>
                        <span className="text-gray-600">|</span>
                        <span className="text-gray-400">{directionStats.call.count} Trades</span>
                        <span className="text-gray-600">|</span>
                        <span className="text-blue-400">
                          {directionStats.call.count > 0 ? ((directionStats.call.wins / directionStats.call.count) * 100).toFixed(1) : '0'}% WR
                        </span>
                      </div>
                    </div>
                    <div className={`text-2xl font-black ${directionStats.call.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      ${directionStats.call.profit > 0 ? '+' : ''}{directionStats.call.profit.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="bg-[#0f1419] border border-gray-800 rounded-xl p-5 relative overflow-hidden group">
                  <div className="absolute -right-4 -top-4 text-gray-800/20 group-hover:text-gray-800/40 transition-colors">
                    <TrendingDown className="w-32 h-32" />
                  </div>
                  <div className="relative z-10 flex items-center justify-between">
                    <div>
                      <div className="text-white font-black text-2xl tracking-wider mb-1">PUT</div>
                      <div className="flex items-center gap-3 text-sm font-medium">
                        <span className="text-emerald-400">{directionStats.put.wins}W</span>
                        <span className="text-gray-600">|</span>
                        <span className="text-gray-400">{directionStats.put.count} Trades</span>
                        <span className="text-gray-600">|</span>
                        <span className="text-blue-400">
                          {directionStats.put.count > 0 ? ((directionStats.put.wins / directionStats.put.count) * 100).toFixed(1) : '0'}% WR
                        </span>
                      </div>
                    </div>
                    <div className={`text-2xl font-black ${directionStats.put.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      ${directionStats.put.profit > 0 ? '+' : ''}{directionStats.put.profit.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="border-gray-800 bg-[#1a1f2e]">
              <div className="flex items-center gap-2 mb-4">
                <Info className="w-5 h-5 text-gray-400" />
                <h3 className="text-lg font-bold text-white">Daily Summary</h3>
              </div>
              <div className="space-y-3 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                {dailyStats.map(({ date, trades: dt, profit, wins: dw, losses: dl }) => (
                  <div key={date} className="flex items-center justify-between p-3 bg-[#0f1419] rounded-lg border border-gray-800">
                    <div>
                      <div className="text-white font-semibold text-sm">
                        {new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                      <div className="flex items-center gap-2 text-xs font-medium">
                        <span className="text-gray-500">{dt} trades</span>
                        <span className="text-emerald-500/80">{dw}W</span>
                        <span className="text-red-500/80">{dl}L</span>
                      </div>
                    </div>
                    <div className={`font-bold ${profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      ${profit > 0 ? '+' : ''}{profit.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>

        {/* Global Styles for Scrollbar inside this component */}
        <style dangerouslySetInnerHTML={{__html: `
          .custom-scrollbar::-webkit-scrollbar {
            width: 6px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: #0f1419; 
            border-radius: 4px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #1f2937; 
            border-radius: 4px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: #374151; 
          }
        `}} />
      </div>
    </div>
  );
}
