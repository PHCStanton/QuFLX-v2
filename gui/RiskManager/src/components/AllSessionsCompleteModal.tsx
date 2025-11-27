import { CheckCircle, Download, TrendingUp } from 'lucide-react';

interface AllSessionsCompleteModalProps {
  isOpen: boolean;
  totalSessions: number;
  totalTrades: number;
  initialBalance: number;
  finalBalance: number;
  totalProfit: number;
  overallWinRate: number;
  onExport: () => void;
  onContinueViewing: () => void;
  onStartNew: () => void;
}

export default function AllSessionsCompleteModal({
  isOpen,
  totalSessions,
  totalTrades,
  initialBalance,
  finalBalance,
  totalProfit,
  overallWinRate,
  onExport,
  onContinueViewing,
  onStartNew
}: AllSessionsCompleteModalProps) {
  if (!isOpen) return null;

  const totalGrowth = initialBalance > 0 ? (totalProfit / initialBalance) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1f2e] border border-gray-800 rounded-2xl p-8 max-w-md w-full">
        <div className="flex items-center justify-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-full flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-white" />
          </div>
        </div>

        <h3 className="text-2xl font-bold text-white text-center mb-3">
          All Sessions Completed!
        </h3>

        <p className="text-gray-400 text-center mb-6">
          You've completed all {totalSessions} sessions ({totalTrades} total trades).
        </p>

        <div className="bg-[#0f1419] rounded-xl p-4 border border-gray-800 mb-4">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <div className="text-gray-400 text-xs mb-1">Initial Balance</div>
              <div className="text-white text-lg font-bold">${initialBalance.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-gray-400 text-xs mb-1">Final Balance</div>
              <div className="text-white text-lg font-bold">${finalBalance.toFixed(2)}</div>
            </div>
          </div>
        </div>

        <div className="space-y-3 mb-6">
          <div className="bg-[#0f1419] rounded-xl p-3 border border-gray-800 flex items-center justify-between">
            <span className="text-gray-400 text-sm">Total Profit</span>
            <span className={`font-bold text-lg ${totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)}
            </span>
          </div>

          <div className="bg-[#0f1419] rounded-xl p-3 border border-gray-800 flex items-center justify-between">
            <span className="text-gray-400 text-sm">Account Growth</span>
            <span className={`font-bold text-lg ${totalGrowth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {totalGrowth >= 0 ? '+' : ''}{totalGrowth.toFixed(2)}%
            </span>
          </div>

          <div className="bg-[#0f1419] rounded-xl p-3 border border-gray-800 flex items-center justify-between">
            <span className="text-gray-400 text-sm">Overall Win Rate</span>
            <span className="text-white font-bold">{overallWinRate.toFixed(1)}%</span>
          </div>
        </div>

        <div className="flex gap-3 mb-3">
          <button
            onClick={onExport}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold transition-colors"
          >
            <Download className="w-4 h-4" />
            Export Data
          </button>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onContinueViewing}
            className="flex-1 py-3 bg-[#0f1419] border border-gray-800 text-white rounded-xl font-semibold hover:bg-gray-800 transition-colors"
          >
            Continue Viewing
          </button>
          <button
            onClick={onStartNew}
            className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-semibold transition-colors"
          >
            Start New
          </button>
        </div>
      </div>
    </div>
  );
}
