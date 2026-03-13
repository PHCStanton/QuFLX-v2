import { CheckCircle, ArrowRight } from 'lucide-react';

interface SessionCompletionModalProps {
  isOpen: boolean;
  sessionNumber: number;
  totalSessions: number;
  sessionStartBalance: number;
  sessionEndBalance: number;
  sessionProfit: number;
  wins: number;
  losses: number;
  onContinue: () => void;
}

export default function SessionCompletionModal({
  isOpen,
  sessionNumber,
  totalSessions,
  sessionStartBalance,
  sessionEndBalance,
  sessionProfit,
  wins,
  losses,
  onContinue
}: SessionCompletionModalProps) {
  if (!isOpen) return null;

  const sessionWinRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0;
  const sessionGrowth = sessionStartBalance > 0
    ? ((sessionEndBalance - sessionStartBalance) / sessionStartBalance) * 100
    : 0;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1f2e] border border-gray-800 rounded-2xl p-8 max-w-md w-full">
        <div className="flex items-center justify-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-white" />
          </div>
        </div>

        <h3 className="text-2xl font-bold text-white text-center mb-2">
          Session {sessionNumber} Complete!
        </h3>

        <p className="text-gray-400 text-center mb-6">
          Session {sessionNumber} of {totalSessions} completed
        </p>

        <div className="bg-[#0f1419] rounded-xl p-4 border border-gray-800 mb-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-gray-400 text-xs mb-1">Session Start</div>
              <div className="text-white text-lg font-bold">${sessionStartBalance.toFixed(2)}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-400 text-xs mb-1">Session End</div>
              <div className="text-white text-lg font-bold">${sessionEndBalance.toFixed(2)}</div>
            </div>
          </div>
        </div>

        <div className="space-y-3 mb-6">
          <div className="bg-[#0f1419] rounded-xl p-3 border border-gray-800 flex items-center justify-between">
            <span className="text-gray-400 text-sm">Session Profit</span>
            <span className={`font-bold ${sessionProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {sessionProfit >= 0 ? '+' : ''}${sessionProfit.toFixed(2)}
            </span>
          </div>

          <div className="bg-[#0f1419] rounded-xl p-3 border border-gray-800 flex items-center justify-between">
            <span className="text-gray-400 text-sm">Session Growth</span>
            <span className={`font-bold ${sessionGrowth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {sessionGrowth >= 0 ? '+' : ''}{sessionGrowth.toFixed(2)}%
            </span>
          </div>

          <div className="bg-[#0f1419] rounded-xl p-3 border border-gray-800 flex items-center justify-between">
            <span className="text-gray-400 text-sm">Win Rate</span>
            <div className="flex items-center gap-3">
              <span className="text-emerald-400 text-sm">{wins}W</span>
              <span className="text-red-400 text-sm">{losses}L</span>
              <span className="text-white font-bold">{sessionWinRate.toFixed(1)}%</span>
            </div>
          </div>
        </div>

        <button
          onClick={onContinue}
          className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-semibold transition-colors"
        >
          Continue to Next Session
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
