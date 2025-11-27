import { LayoutDashboard, TrendingUp, Calendar, BarChart3, Activity, Target, DollarSign, HelpCircle } from 'lucide-react';
import Card from '../components/Card';
import AnimatedQuote from '../components/AnimatedQuote';

interface DashboardProps {
  onNavigate: (page: 'dashboard' | 'risk' | 'calendar' | 'analysis') => void;
  onOpenHelp: () => void;
}

export default function Dashboard({ onNavigate, onOpenHelp }: DashboardProps) {
  return (
    <div className="min-h-screen bg-[#0f1419]">
      <div className="border-b border-gray-800 bg-[#1a1f2e]">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-2xl flex items-center justify-center">
                <LayoutDashboard className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Trading Dashboard</h1>
                <p className="text-gray-400 text-sm">Your binary options trading command center</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AnimatedQuote />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">Trading Days</span>
              <Calendar className="w-5 h-5 text-blue-400" />
            </div>
            <div className="text-3xl font-bold text-white mb-1">--</div>
            <div className="text-sm text-gray-400">Tracked this month</div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">Total Trades</span>
              <Target className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="text-3xl font-bold text-white mb-1">--</div>
            <div className="text-sm text-gray-400">All time</div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">Win Rate</span>
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="text-3xl font-bold text-white mb-1">--%</div>
            <div className="text-sm text-gray-400">Overall performance</div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">Total P/L</span>
              <DollarSign className="w-5 h-5 text-gray-400" />
            </div>
            <div className="text-3xl font-bold text-white mb-1">$--</div>
            <div className="text-sm text-gray-400">Net profit/loss</div>
          </Card>
        </div>

        <div className="mb-8">
          <h2 className="text-xl font-bold text-white mb-4">Quick Actions</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <button
              onClick={() => onNavigate('risk')}
              className="bg-[#1a1f2e] border border-gray-800 rounded-2xl p-6 hover:border-emerald-500 transition-all group text-left"
            >
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Risk Manager</h3>
              <p className="text-gray-400 text-sm mb-4">
                Calculate optimal risk percentages and build custom trading scenarios
              </p>
              <div className="text-emerald-400 text-sm font-semibold group-hover:translate-x-1 transition-transform inline-block">
                Open Risk Manager →
              </div>
            </button>

            <button
              onClick={() => onNavigate('calendar')}
              className="bg-[#1a1f2e] border border-gray-800 rounded-2xl p-6 hover:border-blue-500 transition-all group text-left"
            >
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Calendar className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Trading Calendar</h3>
              <p className="text-gray-400 text-sm mb-4">
                Track your trades, journal your thoughts, and analyze your performance
              </p>
              <div className="text-blue-400 text-sm font-semibold group-hover:translate-x-1 transition-transform inline-block">
                Open Calendar →
              </div>
            </button>

            <button
              onClick={() => onNavigate('analysis')}
              className="bg-[#1a1f2e] border border-gray-800 rounded-2xl p-6 hover:border-blue-500 transition-all group text-left"
            >
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Data Analysis</h3>
              <p className="text-gray-400 text-sm mb-4">
                Visualize and analyze your trading data with powerful insights
              </p>
              <div className="text-blue-400 text-sm font-semibold group-hover:translate-x-1 transition-transform inline-block">
                View Analysis →
              </div>
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          <Card>
            <h3 className="text-xl font-bold text-white mb-4">Getting Started</h3>
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                  <span className="text-emerald-400 font-bold">1</span>
                </div>
                <div>
                  <h4 className="text-white font-semibold mb-1">Learn Risk Management</h4>
                  <p className="text-gray-400 text-sm">
                    Visit the Risk Manager to understand how different risk percentages affect your trading outcomes
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                  <span className="text-blue-400 font-bold">2</span>
                </div>
                <div>
                  <h4 className="text-white font-semibold mb-1">Plan Your Strategy</h4>
                  <p className="text-gray-400 text-sm">
                    Use the Custom Calculator to build and test your trading scenarios before risking real money
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                  <span className="text-blue-400 font-bold">3</span>
                </div>
                <div>
                  <h4 className="text-white font-semibold mb-1">Track Your Trades</h4>
                  <p className="text-gray-400 text-sm">
                    Log your actual trades in the Trading Calendar and journal your decisions for future improvement
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                  <span className="text-emerald-400 font-bold">4</span>
                </div>
                <div>
                  <h4 className="text-white font-semibold mb-1">Analyze & Improve</h4>
                  <p className="text-gray-400 text-sm">
                    Review your performance data to identify patterns and continuously improve your trading
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={onOpenHelp}
              className="w-full mt-6 py-3 bg-blue-500 hover:bg-blue-600 rounded-xl text-white font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <HelpCircle className="w-5 h-5" />
              Learn More - How It Works
            </button>
          </Card>

          <Card>
            <h3 className="text-xl font-bold text-white mb-4">Risk Health Check</h3>
            <div className="bg-[#0f1419] border border-gray-800 rounded-xl p-6 mb-4">
              <div className="flex items-center justify-between mb-4">
                <span className="text-gray-400">Risk Management Status</span>
                <div className="px-3 py-1 bg-gray-700 text-gray-300 rounded-lg text-sm font-semibold">
                  Not Set
                </div>
              </div>
              <p className="text-gray-400 text-sm mb-4">
                Configure your risk parameters in the Risk Manager to get personalized risk assessments
              </p>
              <button
                onClick={() => onNavigate('risk')}
                className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-white font-semibold transition-colors"
              >
                Configure Risk Settings
              </button>
            </div>

            <div className="space-y-3">
              <div className="bg-[#0f1419] border border-gray-800 rounded-xl p-4">
                <h4 className="text-white font-semibold mb-2">Recommended Risk Levels</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Conservative</span>
                    <span className="text-blue-400 font-semibold">1-2%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Moderate</span>
                    <span className="text-emerald-400 font-semibold">3-5%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Aggressive</span>
                    <span className="text-red-400 font-semibold">6-10%</span>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-blue-500/10 to-emerald-500/10 border border-blue-500/20 rounded-xl p-4">
                <h4 className="text-white font-semibold mb-2 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  Pro Tip
                </h4>
                <p className="text-gray-300 text-sm">
                  Most successful traders risk no more than 1-2% of their account balance per trade. Start conservative and increase gradually as you gain experience.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
