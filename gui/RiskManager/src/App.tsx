import { lazy, Suspense, useState } from 'react';
import { HelpCircle } from 'lucide-react';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const RiskManager = lazy(() => import('./pages/RiskManager'));
const TradingCalendar = lazy(() => import('./pages/TradingCalendar'));
const DataVisualizationDemo = lazy(() => import('./pages/DataVisualizationDemo'));
const HowItWorksModal = lazy(() => import('./components/HowItWorksModal'));

function App() {
  const [activePage, setActivePage] = useState<'dashboard' | 'risk' | 'calendar' | 'analysis'>('dashboard');
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  return (
    <div className="min-h-screen bg-[#0f1419]">
      <nav className="border-b border-gray-800 bg-[#1a1f2e]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActivePage('dashboard')}
                className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                  activePage === 'dashboard'
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-[#0f1419]'
                }`}
              >
                Dashboard
              </button>
              <button
                onClick={() => setActivePage('risk')}
                className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                  activePage === 'risk'
                    ? 'bg-emerald-500 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-[#0f1419]'
                }`}
              >
                Risk Manager
              </button>
              <button
                onClick={() => setActivePage('calendar')}
                className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                  activePage === 'calendar'
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-[#0f1419]'
                }`}
              >
                Trading Calendar
              </button>
              <button
                onClick={() => setActivePage('analysis')}
                className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                  activePage === 'analysis'
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-[#0f1419]'
                }`}
              >
                Data Analysis
              </button>
            </div>

            <button
              onClick={() => setShowHowItWorks(true)}
              className="flex items-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all text-gray-400 hover:text-white hover:bg-[#0f1419] border border-gray-800 hover:border-gray-700"
            >
              <HelpCircle className="w-5 h-5" />
              How It Works
            </button>
          </div>
        </div>
      </nav>

      <Suspense fallback={<div className="px-6 py-8 text-gray-400">Loading...</div>}>
        {activePage === 'dashboard' && (
          <Dashboard
            onNavigate={setActivePage}
            onOpenHelp={() => setShowHowItWorks(true)}
          />
        )}
        {activePage === 'risk' && <RiskManager />}
        {activePage === 'calendar' && <TradingCalendar />}
        {activePage === 'analysis' && <DataVisualizationDemo />}
        {showHowItWorks && <HowItWorksModal onClose={() => setShowHowItWorks(false)} />}
      </Suspense>
    </div>
  );
}

export default App;
