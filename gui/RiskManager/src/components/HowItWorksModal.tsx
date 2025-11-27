import { X, Activity, Calendar, BarChart3, Target, TrendingUp, Shield, BookOpen } from 'lucide-react';

interface HowItWorksModalProps {
  onClose: () => void;
}

export default function HowItWorksModal({ onClose }: HowItWorksModalProps) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-[#1a1f2e] border border-gray-800 rounded-2xl max-w-4xl w-full my-8">
        <div className="sticky top-0 bg-[#1a1f2e] border-b border-gray-800 px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">How It Works</h2>
            <p className="text-gray-400 text-sm">Your guide to mastering binary options trading</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#0f1419] rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-8 max-h-[calc(100vh-12rem)] overflow-y-auto">
          <section>
            <h3 className="text-xl font-bold text-white mb-4">App Overview</h3>
            <p className="text-gray-300 mb-4">
              This trading application is designed to help binary options traders manage risk, track performance, and improve their trading decisions through data-driven insights.
            </p>
            <div className="bg-gradient-to-br from-blue-500/10 to-emerald-500/10 border border-blue-500/20 rounded-xl p-4">
              <p className="text-gray-300 text-sm">
                <span className="font-semibold text-white">Key Philosophy:</span> Successful trading isn't about winning every trade—it's about managing risk effectively, maintaining discipline, and learning from every decision.
              </p>
            </div>
          </section>

          <section>
            <h3 className="text-xl font-bold text-white mb-4">Features & Workflow</h3>
            <div className="space-y-4">
              <div className="bg-[#0f1419] border border-gray-800 rounded-xl p-5">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Activity className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-lg font-bold text-white mb-2">Risk Manager</h4>
                    <p className="text-gray-400 text-sm mb-3">
                      Your strategic planning tool for understanding and controlling trading risk.
                    </p>
                    <div className="space-y-2 text-sm">
                      <div className="flex gap-2">
                        <span className="text-emerald-400 font-semibold">•</span>
                        <span className="text-gray-300">
                          <strong>Learn Risk Management:</strong> Interactive educational tool showing how different risk percentages affect your account over multiple sessions
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-emerald-400 font-semibold">•</span>
                        <span className="text-gray-300">
                          <strong>Custom Calculator:</strong> Build and test your own trading scenarios by manually adding wins and losses to see real-time balance changes
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-[#0f1419] border border-gray-800 rounded-xl p-5">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-lg font-bold text-white mb-2">Trading Calendar</h4>
                    <p className="text-gray-400 text-sm mb-3">
                      Track your actual trades and maintain a trading journal for continuous improvement.
                    </p>
                    <div className="space-y-2 text-sm">
                      <div className="flex gap-2">
                        <span className="text-blue-400 font-semibold">•</span>
                        <span className="text-gray-300">
                          <strong>Trade Tracking:</strong> Log trades with entry time, asset, direction, and outcomes
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-blue-400 font-semibold">•</span>
                        <span className="text-gray-300">
                          <strong>Journal Entries:</strong> Document your thoughts, emotions, and decision-making process for each trading day
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-blue-400 font-semibold">•</span>
                        <span className="text-gray-300">
                          <strong>Performance Analytics:</strong> View win rates, profit/loss trends, and identify patterns in your trading
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-[#0f1419] border border-gray-800 rounded-xl p-5">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
                    <BarChart3 className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-lg font-bold text-white mb-2">Data Analysis</h4>
                    <p className="text-gray-400 text-sm mb-3">
                      Visualize your trading data with comprehensive analytics and insights.
                    </p>
                    <div className="space-y-2 text-sm">
                      <div className="flex gap-2">
                        <span className="text-blue-400 font-semibold">•</span>
                        <span className="text-gray-300">
                          <strong>Sample Data Demo:</strong> See what's possible with the app's analytical capabilities using real CSV export data
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-blue-400 font-semibold">•</span>
                        <span className="text-gray-300">
                          <strong>Asset Performance:</strong> Identify which assets and market conditions work best for your strategy
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-blue-400 font-semibold">•</span>
                        <span className="text-gray-300">
                          <strong>Direction Analysis:</strong> Compare your CALL vs PUT performance to refine your approach
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-xl font-bold text-white mb-4">Risk Management Best Practices</h3>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-[#0f1419] border border-blue-500/30 rounded-xl p-4">
                <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center mb-3">
                  <Shield className="w-5 h-5 text-blue-400" />
                </div>
                <h4 className="text-white font-semibold mb-2">Conservative (1-2%)</h4>
                <p className="text-gray-400 text-sm">
                  Best for beginners and capital preservation. Slower growth but much lower risk of significant losses.
                </p>
              </div>

              <div className="bg-[#0f1419] border border-emerald-500/30 rounded-xl p-4">
                <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center mb-3">
                  <Target className="w-5 h-5 text-emerald-400" />
                </div>
                <h4 className="text-white font-semibold mb-2">Moderate (3-5%)</h4>
                <p className="text-gray-400 text-sm">
                  Balanced approach for experienced traders. Offers reasonable growth potential with manageable risk.
                </p>
              </div>

              <div className="bg-[#0f1419] border border-red-500/30 rounded-xl p-4">
                <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center mb-3">
                  <TrendingUp className="w-5 h-5 text-red-400" />
                </div>
                <h4 className="text-white font-semibold mb-2">Aggressive (6-10%)</h4>
                <p className="text-gray-400 text-sm">
                  High risk, high reward. Only for experienced traders with strong risk tolerance and discipline.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-xl font-bold text-white mb-4">Recommended Workflow</h3>
            <div className="space-y-3">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">1</span>
                </div>
                <div>
                  <h4 className="text-white font-semibold mb-1">Learn & Plan</h4>
                  <p className="text-gray-400 text-sm">
                    Start in the Risk Manager. Use the educational scenarios to understand risk percentages, then use the Custom Calculator to plan your actual trading strategy.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">2</span>
                </div>
                <div>
                  <h4 className="text-white font-semibold mb-1">Execute & Track</h4>
                  <p className="text-gray-400 text-sm">
                    Log every trade in the Trading Calendar. Include details like time, asset, direction, and outcome. This builds your trading history.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">3</span>
                </div>
                <div>
                  <h4 className="text-white font-semibold mb-1">Journal & Reflect</h4>
                  <p className="text-gray-400 text-sm">
                    Write journal entries about your trading sessions. Note what went well, what didn't, and how you felt. Emotional awareness is crucial for discipline.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">4</span>
                </div>
                <div>
                  <h4 className="text-white font-semibold mb-1">Analyze & Improve</h4>
                  <p className="text-gray-400 text-sm">
                    Review your data analytics to identify patterns. Which assets perform best? What time of day? Are you better at CALLs or PUTs? Use insights to refine your strategy.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">5</span>
                </div>
                <div>
                  <h4 className="text-white font-semibold mb-1">Adjust & Repeat</h4>
                  <p className="text-gray-400 text-sm">
                    Based on your analysis, adjust your risk parameters and strategy. Return to the Risk Manager to test new approaches before implementing them.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-xl font-bold text-white mb-4">Key Success Principles</h3>
            <div className="bg-gradient-to-br from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 rounded-xl p-5">
              <div className="flex items-start gap-3 mb-3">
                <BookOpen className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <p className="text-gray-300 text-sm">
                  <strong className="text-white">Consistency Over Perfection:</strong> You don't need to win every trade. With proper risk management and a 55-60% win rate, you can be profitable.
                </p>
              </div>
              <div className="flex items-start gap-3 mb-3">
                <BookOpen className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <p className="text-gray-300 text-sm">
                  <strong className="text-white">Discipline is Everything:</strong> Stick to your risk percentage. Never chase losses. Follow your plan even when emotions run high.
                </p>
              </div>
              <div className="flex items-start gap-3 mb-3">
                <BookOpen className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <p className="text-gray-300 text-sm">
                  <strong className="text-white">Data-Driven Decisions:</strong> Trust the numbers, not your gut. Use your trading history and analytics to guide improvements.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <BookOpen className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <p className="text-gray-300 text-sm">
                  <strong className="text-white">Long-Term Thinking:</strong> Trading success is measured in months and years, not days. Focus on sustainable growth and continuous learning.
                </p>
              </div>
            </div>
          </section>
        </div>

        <div className="sticky bottom-0 bg-[#1a1f2e] border-t border-gray-800 px-6 py-4 rounded-b-2xl">
          <button
            onClick={onClose}
            className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 rounded-xl text-white font-semibold transition-colors"
          >
            Got It - Start Trading Smarter
          </button>
        </div>
      </div>
    </div>
  );
}
