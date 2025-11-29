import { AlertTriangle, Trophy, X } from 'lucide-react';

interface LimitReachedModalProps {
  isOpen: boolean;
  type: 'profit' | 'drawdown';
  amount: number;
  onClose: () => void;
  onContinue: () => void;
}

export default function LimitReachedModal({
  isOpen,
  type,
  amount,
  onClose,
  onContinue
}: LimitReachedModalProps) {
  if (!isOpen) return null;

  const isProfit = type === 'profit';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-[#1a1f2e] border border-gray-800 rounded-2xl w-full max-w-md p-6 relative animate-in fade-in zoom-in duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center text-center mb-6">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
            isProfit ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'
          }`}>
            {isProfit ? <Trophy className="w-8 h-8" /> : <AlertTriangle className="w-8 h-8" />}
          </div>
          
          <h2 className="text-2xl font-bold text-white mb-2">
            {isProfit ? 'Profit Target Reached! 🎉' : 'Drawdown Limit Reached ⚠️'}
          </h2>
          
          <p className="text-gray-400">
            {isProfit 
              ? `Congratulations! You've hit your profit target of $${amount.toFixed(2)}.`
              : `You've reached your maximum drawdown limit of $${amount.toFixed(2)}.`}
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-[#0f1419] hover:bg-gray-800 border border-gray-700 text-gray-300 rounded-xl transition-colors font-medium"
          >
            Close & Review
          </button>
          <button
            onClick={onContinue}
            className={`flex-1 px-4 py-3 rounded-xl transition-colors font-medium text-white ${
              isProfit ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600'
            }`}
          >
            {isProfit ? 'Continue Trading' : 'Stop Session'}
          </button>
        </div>
      </div>
    </div>
  );
}
