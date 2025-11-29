import { useState, useEffect } from 'react';
import { Activity } from 'lucide-react';
import RiskCalculator from '../components/RiskCalculator';
import SessionTable from '../components/SessionTable';
import RiskComparison from '../components/RiskComparison';
import AnimatedQuote from '../components/AnimatedQuote';
import RiskVisualizationPrototype from '../components/RiskVisualizationPrototype';
import UnifiedRiskControls from '../components/UnifiedRiskControls';
import TradeSessionsManager from '../components/TradeSessionsManager';
import TPDrawdownControls from '../components/TPDrawdownControls';
import SessionCompletionModal from '../components/SessionCompletionModal';
import AllSessionsCompleteModal from '../components/AllSessionsCompleteModal';
import LimitReachedModal from '../components/LimitReachedModal';
import { RiskCalculator as Calculator, SessionData, RiskScenario } from '../lib/risk-calculations';
import { exportToCSV } from '../lib/export-utils';

interface Trade {
  id: number;
  result: 'win' | 'loss';
}

interface CompletedSession {
  id: number;
  trades: Trade[];
  startBalance: number;
  endBalance: number;
  profit: number;
}

export default function RiskManager() {
  const [startingBalance, setStartingBalance] = useState(1000);
  const [riskPercentage, setRiskPercentage] = useState(1);
  const [numberOfSessions, setNumberOfSessions] = useState(10);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [riskComparison, setRiskComparison] = useState<RiskScenario[]>([]);
  const [activeTab, setActiveTab] = useState<'scenarios' | 'custom'>('custom');

  const [balance, setBalance] = useState(1000);
  const [initialBalance, setInitialBalance] = useState(1000);
  const [riskPercentPerTrade, setRiskPercentPerTrade] = useState(1.0);
  const [drawdownPercent, setDrawdownPercent] = useState(10);
  const [riskRewardRatio, setRiskRewardRatio] = useState(2);
  const [payoutPercentage, setPayoutPercentage] = useState(92);
  const [useFixedAmount, setUseFixedAmount] = useState(false);
  const [fixedRiskAmount, setFixedRiskAmount] = useState(10);
  const [tradesPerSession, setTradesPerSession] = useState(4);
  const [maxSessions, setMaxSessions] = useState(3);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [currentSession, setCurrentSession] = useState<Trade[]>([]);
  const [completedSessions, setCompletedSessions] = useState<CompletedSession[]>([]);
  const [sessionStartBalance, setSessionStartBalance] = useState(1000);
  const [showSessionCompleteModal, setShowSessionCompleteModal] = useState(false);
  const [showAllSessionsCompleteModal, setShowAllSessionsCompleteModal] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [limitType, setLimitType] = useState<'profit' | 'drawdown'>('drawdown');

  const handleCalculate = () => {
    const calculator = new Calculator();
    const generatedSessions = calculator.generateSessionProgression(
      startingBalance,
      riskPercentage,
      numberOfSessions
    );
    setSessions(generatedSessions);

    const comparison = calculator.calculateRiskComparison(startingBalance, numberOfSessions);
    setRiskComparison(comparison);
  };

  const summaryStats = sessions.length > 0
    ? new Calculator().calculateSummaryStats(sessions, startingBalance)
    : { totalProfit: 0, totalGrowth: 0, winRate: 0, avgProfit: 0, finalBalance: 0 };

  const canEditSettings = trades.length === 0 && currentSession.length === 0;

  useEffect(() => {
    if (currentSession.length >= tradesPerSession && currentSession.length > 0) {
      setShowSessionCompleteModal(true);
    }
  }, [currentSession.length, tradesPerSession]);

  const handleBalanceChange = (value: number) => {
    setInitialBalance(value);
    setBalance(value);
    setSessionStartBalance(value);
  };

  const handleAddTrade = (result: 'win' | 'loss') => {
    if (currentSession.length >= tradesPerSession) return;
    if (completedSessions.length >= maxSessions) return;

    const newTrade: Trade = {
      id: Date.now(),
      result
    };

    const riskAmount = useFixedAmount ? fixedRiskAmount : balance * (riskPercentPerTrade / 100);
    let balanceChange = 0;

    if (result === 'win') {
      balanceChange = riskAmount * (payoutPercentage / 100);
    } else {
      balanceChange = -riskAmount;
    }

    const newBalance = balance + balanceChange;
    setBalance(newBalance);
    setCurrentSession([...currentSession, newTrade]);
    setTrades([...trades, newTrade]);

    // Check limits
    const totalDrawdownAmount = initialBalance * (drawdownPercent / 100);
    const maxDrawdownLimit = initialBalance - totalDrawdownAmount;
    const takeProfitTarget = initialBalance + (totalDrawdownAmount * riskRewardRatio);

    if (newBalance <= maxDrawdownLimit) {
      setLimitType('drawdown');
      setShowLimitModal(true);
    } else if (newBalance >= takeProfitTarget) {
      setLimitType('profit');
      setShowLimitModal(true);
    }
  };

  const handleSessionComplete = () => {
    const newSession: CompletedSession = {
      id: completedSessions.length + 1,
      trades: currentSession,
      startBalance: sessionStartBalance,
      endBalance: balance,
      profit: balance - sessionStartBalance
    };

    const newCompletedSessions = [...completedSessions, newSession];
    setCompletedSessions(newCompletedSessions);
    setCurrentSession([]);
    setSessionStartBalance(balance);
    setShowSessionCompleteModal(false);

    if (newCompletedSessions.length >= maxSessions) {
      setShowAllSessionsCompleteModal(true);
    }
  };

  const handleExportData = () => {
    const calculator = new Calculator();
    const sessionData: SessionData[] = completedSessions.map((session, index) => ({
      sessionNumber: session.id,
      startingBalance: session.startBalance,
      riskPerTrade: useFixedAmount ? fixedRiskAmount : calculator.calculateRiskPerTrade(session.startBalance, riskPercentPerTrade),
      outcome: {
        wins: session.trades.filter(t => t.result === 'win').length,
        losses: session.trades.filter(t => t.result === 'loss').length
      },
      profit: session.profit,
      endingBalance: session.endBalance,
      growthPercent: ((session.endBalance - initialBalance) / initialBalance) * 100
    }));

    const allTrades = trades;
    const wins = allTrades.filter(t => t.result === 'win').length;
    const totalTrades = allTrades.length;

    const summaryStats = {
      totalProfit: balance - initialBalance,
      totalGrowth: ((balance - initialBalance) / initialBalance) * 100,
      winRate: totalTrades > 0 ? (wins / totalTrades) * 100 : 0,
      avgProfit: completedSessions.length > 0
        ? completedSessions.reduce((sum, s) => sum + s.profit, 0) / completedSessions.length
        : 0,
      finalBalance: balance
    };

    exportToCSV(sessionData, summaryStats);
  };

  const handleReset = () => {
    setBalance(initialBalance);
    setTrades([]);
    setCurrentSession([]);
    setCompletedSessions([]);
    setSessionStartBalance(initialBalance);
    setShowSessionCompleteModal(false);
    setShowAllSessionsCompleteModal(false);
    setShowLimitModal(false);
  };

  return (
    <div className="min-h-screen bg-[#0f1419]">
      <div className="border-b border-gray-800 bg-[#1a1f2e]">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl flex items-center justify-center">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Binary Options Risk Manager</h1>
              <p className="text-gray-400 text-sm">Calculate and analyze your trading risk scenarios</p>
            </div>
          </div>
        </div>
      </div>

      <AnimatedQuote />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <div className="inline-flex bg-[#1a1f2e] border border-gray-800 rounded-xl p-1">
            <button
              onClick={() => setActiveTab('custom')}
              className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                activeTab === 'custom'
                  ? 'bg-emerald-500 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Custom Calculator
            </button>
            <button
              onClick={() => setActiveTab('scenarios')}
              className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                activeTab === 'scenarios'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Learn Risk Management
            </button>
          </div>
        </div>

        {activeTab === 'scenarios' ? (
          <>
            <div className="mb-6 bg-gradient-to-br from-blue-500/10 to-emerald-500/10 border border-blue-500/20 rounded-2xl p-6">
              <h3 className="text-xl font-bold text-white mb-3">Understanding Risk Management</h3>
              <p className="text-gray-300 text-sm mb-3">
                This educational tool helps you understand how different risk percentages affect your trading account over time.
                Risk percentage is the amount of your account balance you're willing to risk on each trade.
              </p>
              <p className="text-gray-300 text-sm">
                Try different scenarios below to see how conservative (1-2%), moderate (3-5%), or aggressive (6-10%) risk strategies
                impact your potential growth and drawdown. This is for learning purposes—use the Custom Calculator tab to build your actual trading plan.
              </p>
            </div>

            <div className="grid lg:grid-cols-3 gap-8 mb-8">
              <div className="lg:col-span-1">
                <RiskCalculator
                  startingBalance={startingBalance}
                  setStartingBalance={setStartingBalance}
                  riskPercentage={riskPercentage}
                  setRiskPercentage={setRiskPercentage}
                  numberOfSessions={numberOfSessions}
                  setNumberOfSessions={setNumberOfSessions}
                  onCalculate={handleCalculate}
                />
              </div>

              <div className="lg:col-span-2 space-y-8">
                {sessions.length > 0 && (
                  <>
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                      <p className="text-sm text-gray-300">
                        <strong className="text-white">How to read this:</strong> The table below shows a simulated trading progression
                        based on your risk settings. The Risk Comparison shows how different risk percentages would perform with
                        similar win rates. Remember: these are examples to help you understand risk dynamics—real trading results will vary.
                      </p>
                    </div>
                    <SessionTable sessions={sessions} summaryStats={summaryStats} />
                    <RiskComparison riskComparison={riskComparison} />
                  </>
                )}

                {sessions.length === 0 && (
                  <div className="bg-[#1a1f2e] border border-gray-800 rounded-2xl p-12 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-500/20 to-emerald-500/20 rounded-2xl flex items-center justify-center">
                      <Activity className="w-8 h-8 text-gray-600" />
                    </div>
                    <h3 className="text-xl font-semibold text-white mb-2">Ready to Learn</h3>
                    <p className="text-gray-400 mb-4">
                      Set your parameters and click "Generate Session Scenarios" to see how different risk levels affect your account
                    </p>
                    <div className="max-w-md mx-auto text-left bg-[#0f1419] border border-gray-800 rounded-xl p-4">
                      <p className="text-sm text-gray-400 mb-2">
                        <strong className="text-white">Tip:</strong> Start by comparing these scenarios:
                      </p>
                      <ul className="text-sm text-gray-400 space-y-1">
                        <li>• 1% risk (conservative approach)</li>
                        <li>• 5% risk (moderate approach)</li>
                        <li>• 10% risk (aggressive approach)</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-12 pt-12 border-t border-gray-800">
              <RiskVisualizationPrototype />
            </div>
          </>
        ) : (
          <div className="space-y-6">
            <UnifiedRiskControls
              balance={balance}
              initialBalance={initialBalance}
              riskPercentPerTrade={riskPercentPerTrade}
              drawdownPercent={drawdownPercent}
              riskRewardRatio={riskRewardRatio}
              payoutPercentage={payoutPercentage}
              useFixedAmount={useFixedAmount}
              fixedRiskAmount={fixedRiskAmount}
              onBalanceChange={handleBalanceChange}
              onRiskPercentChange={setRiskPercentPerTrade}
              onDrawdownPercentChange={setDrawdownPercent}
              onRiskRewardRatioChange={setRiskRewardRatio}
              onPayoutPercentageChange={setPayoutPercentage}
              onUseFixedAmountChange={setUseFixedAmount}
              onFixedRiskAmountChange={setFixedRiskAmount}
              onAddTrade={handleAddTrade}
              onReset={handleReset}
              canEditSettings={canEditSettings}
              isLinked={false}
            />

            <div className="grid lg:grid-cols-2 gap-6">
              <TradeSessionsManager
                trades={currentSession}
                balance={balance}
                initialBalance={initialBalance}
                riskPercent={riskPercentPerTrade}
                tradesPerSession={tradesPerSession}
                maxSessions={maxSessions}
                onTradesPerSessionChange={setTradesPerSession}
                onMaxSessionsChange={setMaxSessions}
                canEditSettings={canEditSettings}
                currentSessionNumber={completedSessions.length + 1}
                completedSessions={completedSessions}
              />

              <TPDrawdownControls
                balance={balance}
                initialBalance={initialBalance}
                riskPercentPerTrade={riskPercentPerTrade}
                drawdownPercent={drawdownPercent}
                riskRewardRatio={riskRewardRatio}
              />
            </div>
          </div>
        )}

        <SessionCompletionModal
          isOpen={showSessionCompleteModal}
          sessionNumber={completedSessions.length + 1}
          totalSessions={maxSessions}
          sessionStartBalance={sessionStartBalance}
          sessionEndBalance={balance}
          sessionProfit={balance - sessionStartBalance}
          wins={currentSession.filter(t => t.result === 'win').length}
          losses={currentSession.filter(t => t.result === 'loss').length}
          onContinue={handleSessionComplete}
        />

        <AllSessionsCompleteModal
          isOpen={showAllSessionsCompleteModal}
          totalSessions={maxSessions}
          totalTrades={trades.length}
          initialBalance={initialBalance}
          finalBalance={balance}
          totalProfit={balance - initialBalance}
          overallWinRate={trades.length > 0 ? (trades.filter(t => t.result === 'win').length / trades.length) * 100 : 0}
          onExport={handleExportData}
          onContinueViewing={() => setShowAllSessionsCompleteModal(false)}
          onStartNew={handleReset}
        />

        <LimitReachedModal
          isOpen={showLimitModal}
          type={limitType}
          amount={limitType === 'profit' ? balance : balance}
          onClose={() => setShowLimitModal(false)}
          onContinue={() => setShowLimitModal(false)}
        />
      </div>
    </div>
  );
}
