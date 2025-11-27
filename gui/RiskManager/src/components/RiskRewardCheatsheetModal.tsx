import { X, BookOpen } from 'lucide-react';

interface RiskRewardCheatsheetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function RiskRewardCheatsheetModal({ isOpen, onClose }: RiskRewardCheatsheetModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#1a1f2e] border border-gray-800 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-xl flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Risk:Reward & Win Rate Cheatsheet</h2>
              <p className="text-sm text-gray-400">Profitability guide for different ratios</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="bg-[#0f1419] border border-gray-800 rounded-xl p-4 mb-6">
            <h3 className="text-white font-semibold mb-3">How to Read This Chart</h3>
            <div className="space-y-2 text-sm text-gray-300">
              <p>
                <strong className="text-emerald-400">Green (PROFIT):</strong> With this risk:reward ratio and win rate, you'll be profitable over time
              </p>
              <p>
                <strong className="text-gray-400">Gray (BREAK EVEN):</strong> You'll roughly break even - no profit, no loss
              </p>
              <p>
                <strong className="text-red-400">Red (LOSS):</strong> With this combination, you'll lose money over time
              </p>
            </div>
          </div>

          <div className="bg-[#0f1419] border border-gray-800 rounded-xl overflow-hidden mb-6">
            <img
              src="/Risk-Reward_Cheatsheet.png"
              alt="Risk Reward and Win Rate Cheatsheet showing profitability outcomes"
              className="w-full h-auto"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-[#0f1419] border border-gray-800 rounded-xl p-4">
              <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                Key Insights
              </h4>
              <ul className="space-y-2 text-sm text-gray-300">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-1">•</span>
                  <span>Higher risk:reward ratios require <strong>lower win rates</strong> to be profitable</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-1">•</span>
                  <span>A 1:3 ratio needs only <strong>25% wins</strong> to profit</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-1">•</span>
                  <span>A 1:1 ratio needs <strong>50% wins</strong> to break even</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-1">•</span>
                  <span>Better ratios give you more room for error</span>
                </li>
              </ul>
            </div>

            <div className="bg-[#0f1419] border border-gray-800 rounded-xl p-4">
              <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                Practical Application
              </h4>
              <ul className="space-y-2 text-sm text-gray-300">
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1">•</span>
                  <span>Track your actual win rate over 20+ trades</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1">•</span>
                  <span>Match your risk:reward ratio to your win rate</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1">•</span>
                  <span>If your win rate is 40%, aim for at least 1:2</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1">•</span>
                  <span>Lower win rates need higher ratios to succeed</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-6 bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
            <p className="text-sm text-gray-300">
              <strong className="text-blue-400">Pro Tip:</strong> Most successful traders aim for risk:reward ratios of at least 1:2 or higher.
              This gives them a buffer for mistakes and allows them to be profitable even with a win rate below 50%.
            </p>
          </div>
        </div>

        <div className="p-6 border-t border-gray-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl transition-colors font-medium"
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}
