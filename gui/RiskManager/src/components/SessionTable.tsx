import { Download, FileSpreadsheet } from 'lucide-react';
import { SessionData } from '../lib/risk-calculations';
import { exportToCSV, exportToExcel } from '../lib/export-utils';

interface SessionTableProps {
  sessions: SessionData[];
  summaryStats: {
    totalProfit: number;
    totalGrowth: number;
    winRate: number;
    avgProfit: number;
    finalBalance: number;
  };
}

export default function SessionTable({ sessions, summaryStats }: SessionTableProps) {
  if (sessions.length === 0) {
    return null;
  }

  return (
    <div className="bg-[#1a1f2e] border border-gray-800 rounded-2xl p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-white font-semibold text-xl">Session Progression Analysis</h3>
        <div className="flex gap-3">
          <button
            onClick={() => exportToCSV(sessions, summaryStats)}
            className="flex items-center gap-2 px-4 py-2 bg-[#0f1419] border border-gray-800 hover:border-emerald-500 text-gray-400 hover:text-emerald-400 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            <span className="font-medium">Export CSV</span>
          </button>
          <button
            onClick={() => exportToExcel(sessions, summaryStats)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors font-medium"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-5 gap-4">
        <div className="bg-[#0f1419] rounded-xl p-4 border border-gray-800">
          <div className="text-gray-400 text-sm mb-1">Total Profit</div>
          <div className={`text-2xl font-bold ${summaryStats.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {summaryStats.totalProfit >= 0 ? '+' : ''}${summaryStats.totalProfit.toFixed(2)}
          </div>
        </div>

        <div className="bg-[#0f1419] rounded-xl p-4 border border-gray-800">
          <div className="text-gray-400 text-sm mb-1">Total Growth</div>
          <div className={`text-2xl font-bold ${summaryStats.totalGrowth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {summaryStats.totalGrowth >= 0 ? '+' : ''}{summaryStats.totalGrowth.toFixed(2)}%
          </div>
        </div>

        <div className="bg-[#0f1419] rounded-xl p-4 border border-gray-800">
          <div className="text-gray-400 text-sm mb-1">Win Rate</div>
          <div className="text-white text-2xl font-bold">{summaryStats.winRate.toFixed(1)}%</div>
        </div>

        <div className="bg-[#0f1419] rounded-xl p-4 border border-gray-800">
          <div className="text-gray-400 text-sm mb-1">Avg Profit</div>
          <div className={`text-2xl font-bold ${summaryStats.avgProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {summaryStats.avgProfit >= 0 ? '+' : ''}${summaryStats.avgProfit.toFixed(2)}
          </div>
        </div>

        <div className="bg-[#0f1419] rounded-xl p-4 border border-gray-800">
          <div className="text-gray-400 text-sm mb-1">Final Balance</div>
          <div className="text-white text-2xl font-bold">${summaryStats.finalBalance.toFixed(2)}</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left py-4 px-4 text-gray-400 font-medium">Session</th>
              <th className="text-left py-4 px-4 text-gray-400 font-medium">Starting Balance</th>
              <th className="text-left py-4 px-4 text-gray-400 font-medium">Risk/Trade</th>
              <th className="text-left py-4 px-4 text-gray-400 font-medium">Wins</th>
              <th className="text-left py-4 px-4 text-gray-400 font-medium">Losses</th>
              <th className="text-left py-4 px-4 text-gray-400 font-medium">Profit</th>
              <th className="text-left py-4 px-4 text-gray-400 font-medium">Ending Balance</th>
              <th className="text-left py-4 px-4 text-gray-400 font-medium">Growth %</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session, index) => (
              <tr
                key={session.sessionNumber}
                className={`border-b border-gray-800 hover:bg-[#0f1419] transition-colors ${
                  index % 2 === 0 ? 'bg-[#0f1419]/30' : ''
                }`}
              >
                <td className="py-4 px-4 text-white font-medium">#{session.sessionNumber}</td>
                <td className="py-4 px-4 text-gray-300">${session.startingBalance.toFixed(2)}</td>
                <td className="py-4 px-4 text-gray-300">${session.riskPerTrade.toFixed(2)}</td>
                <td className="py-4 px-4">
                  <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-lg font-semibold">
                    {session.outcome.wins}W
                  </span>
                </td>
                <td className="py-4 px-4">
                  <span className="px-3 py-1 bg-red-500/20 text-red-400 rounded-lg font-semibold">
                    {session.outcome.losses}L
                  </span>
                </td>
                <td className={`py-4 px-4 font-semibold ${session.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {session.profit >= 0 ? '+' : ''}${session.profit.toFixed(2)}
                </td>
                <td className="py-4 px-4 text-white font-semibold">${session.endingBalance.toFixed(2)}</td>
                <td className={`py-4 px-4 font-semibold ${session.growthPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {session.growthPercent >= 0 ? '+' : ''}{session.growthPercent.toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
