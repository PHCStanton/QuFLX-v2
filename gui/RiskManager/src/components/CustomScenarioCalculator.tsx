import { useState, useEffect } from 'react';
import { Plus, Download, CheckCircle } from 'lucide-react';
import { RiskCalculator, SessionData } from '../lib/risk-calculations';
import { exportToCSV } from '../lib/export-utils';

interface Trade {
  id: number;
  result: 'win' | 'loss';
}

interface CustomSession {
  id: number;
  trades: Trade[];
  profit: number;
  balance: number;
}

interface CustomScenarioCalculatorProps {
  onStateChange?: (state: {
    balance: number;
    initialBalance: number;
    riskPercent: number;
    currentSession: Trade[];
    sessions: CustomSession[];
  }) => void;
}

export default function CustomScenarioCalculator({ onStateChange }: CustomScenarioCalculatorProps) {
  const [initialBalance, setInitialBalance] = useState(1000);
  const [balance, setBalance] = useState(1000);
  const [riskPercent, setRiskPercent] = useState(1.00);
  const [customRiskPercent, setCustomRiskPercent] = useState('');
  const [tradesPerSession, setTradesPerSession] = useState(4);
  const [maxSessions, setMaxSessions] = useState(3);
  const [currentSession, setCurrentSession] = useState<Trade[]>([]);
  const [sessions, setSessions] = useState<CustomSession[]>([]);
  const [sessionCounter, setSessionCounter] = useState(1);
  const [showMaxSessionModal, setShowMaxSessionModal] = useState(false);
  const [balanceInput, setBalanceInput] = useState('1000');

  const normalizeDecimalInput = (value: string): string => {
    return value.replace(/,/g, '.');
  };

  const calculator = new RiskCalculator();
  const riskPerTrade = calculator.calculateRiskPerTrade(balance, riskPercent);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  useEffect(() => {
    if (onStateChange) {
      onStateChange({
        balance,
        initialBalance,
        riskPercent,
        currentSession,
        sessions
      });
    }
  }, [balance, initialBalance, riskPercent, currentSession, sessions, onStateChange]);

  const addTrade = (result: 'win' | 'loss') => {
    if (currentSession.length >= tradesPerSession) return;

    const newTrade: Trade = {
      id: Date.now(),
      result
    };

    const currentRiskAmount = calculator.calculateRiskPerTrade(balance, riskPercent);
    let balanceChange = 0;

    if (result === 'win') {
      balanceChange = currentRiskAmount * 0.92;
    } else {
      balanceChange = -currentRiskAmount;
    }

    const newBalance = balance + balanceChange;
    setBalance(newBalance);
    setCurrentSession([...currentSession, newTrade]);
  };

  const completeSession = () => {
    if (currentSession.length === 0) return;

    const sessionStartBalance = sessions.length === 0
      ? initialBalance
      : sessions[sessions.length - 1].balance;

    const sessionProfit = balance - sessionStartBalance;

    const newSession: CustomSession = {
      id: sessionCounter,
      trades: currentSession,
      profit: sessionProfit,
      balance: balance
    };

    const newSessions = [...sessions, newSession];
    setSessions(newSessions);
    setCurrentSession([]);
    setSessionCounter(sessionCounter + 1);

    if (newSessions.length >= maxSessions) {
      setShowMaxSessionModal(true);
    }
  };

  const resetAll = () => {
    setInitialBalance(1000);
    setBalance(1000);
    setBalanceInput('1000');
    setRiskPercent(1.00);
    setCustomRiskPercent('');
    setCurrentSession([]);
    setSessions([]);
    setSessionCounter(1);
    setShowMaxSessionModal(false);
  };

  const handleCustomRiskChange = (value: string) => {
    setCustomRiskPercent(value);
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) {
      setRiskPercent(numValue);
    }
  };

  const handleBalanceChange = (value: string) => {
    setBalanceInput(value);
    const normalized = normalizeDecimalInput(value);
    const numValue = parseFloat(normalized);
    if (!isNaN(numValue) && numValue > 0) {
      setInitialBalance(numValue);
      setBalance(numValue);
    }
  };

  const handleBalanceBlur = () => {
    const numValue = parseFloat(normalizeDecimalInput(balanceInput));
    if (!isNaN(numValue) && numValue > 0) {
      setInitialBalance(numValue);
      setBalance(numValue);
      setBalanceInput(numValue.toFixed(2));
    } else {
      setBalanceInput(initialBalance.toFixed(2));
    }
  };

  const canEditBalance = sessions.length === 0 && currentSession.length === 0;

  const exportSessions = () => {
    const sessionData: SessionData[] = sessions.map((session, index) => ({
      sessionNumber: index + 1,
      startingBalance: index === 0 ? initialBalance : sessions[index - 1].balance,
      riskPerTrade: calculator.calculateRiskPerTrade(
        index === 0 ? initialBalance : sessions[index - 1].balance,
        riskPercent
      ),
      outcome: {
        wins: session.trades.filter(t => t.result === 'win').length,
        losses: session.trades.filter(t => t.result === 'loss').length
      },
      profit: session.profit,
      endingBalance: session.balance,
      growthPercent: ((session.balance - initialBalance) / initialBalance) * 100
    }));

    const summaryStats = {
      totalProfit: balance - initialBalance,
      totalGrowth: ((balance - initialBalance) / initialBalance) * 100,
      winRate: (sessions.reduce((sum, s) => sum + s.trades.filter(t => t.result === 'win').length, 0) /
                sessions.reduce((sum, s) => sum + s.trades.length, 0)) * 100,
      avgProfit: sessions.reduce((sum, s) => sum + s.profit, 0) / sessions.length,
      finalBalance: balance
    };

    exportToCSV(sessionData, summaryStats);
  };

  return (
    <div className="lg:grid lg:grid-cols-12 gap-6 space-y-6 lg:space-y-0">
      {/* Left Column - Inputs & Controls */}
      <div className="lg:col-span-5 space-y-6">
        <div className="bg-[#1a1f2e] border border-gray-800 rounded-2xl p-6">
          <h3 className="text-white font-semibold text-xl mb-6">Custom Scenario Builder</h3>

          <div className="grid md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-gray-400 text-sm mb-2">
              Current Balance
              {!canEditBalance && <span className="text-xs ml-2 text-gray-500">(Reset to edit)</span>}
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              {canEditBalance ? (
                <input
                  type="text"
                  inputMode="decimal"
                  value={balanceInput}
                  onChange={(e) => handleBalanceChange(e.target.value)}
                  onBlur={handleBalanceBlur}
                  className="w-full pl-8 pr-4 py-3 bg-[#0f1419] border border-gray-800 rounded-xl text-white focus:border-emerald-500 focus:outline-none"
                  placeholder="Enter starting balance"
                />
              ) : (
                <input
                  type="text"
                  value={balance.toFixed(2)}
                  readOnly
                  className="w-full pl-8 pr-4 py-3 bg-[#0f1419] border border-gray-800 rounded-xl text-white cursor-not-allowed opacity-75"
                />
              )}
            </div>
          </div>

          <div>
            <label className="block text-gray-400 text-sm mb-2">Risk Percentage</label>
            <div className="flex gap-2 mb-2">
              {[1, 5, 10].map((percent) => (
                <button
                  key={percent}
                  onClick={() => {
                    setRiskPercent(percent);
                    setCustomRiskPercent(percent.toString());
                  }}
                  className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                    riskPercent === percent
                      ? 'bg-emerald-500 text-white'
                      : 'bg-[#0f1419] text-gray-400 border border-gray-800 hover:border-gray-700'
                  }`}
                >
                  {percent}%
                </button>
              ))}
            </div>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                value={customRiskPercent}
                onChange={(e) => handleCustomRiskChange(normalizeDecimalInput(e.target.value))}
                onBlur={() => setCustomRiskPercent(riskPercent.toString())}
                placeholder="Custom % (e.g., 2.50)"
                className="w-full px-4 py-3 bg-[#0f1419] border border-gray-800 rounded-xl text-white placeholder:text-gray-600 focus:border-emerald-500 focus:outline-none"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">%</span>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-gray-400 text-sm mb-2">Trades Per Session</label>
            <input
              type="number"
              min="1"
              value={tradesPerSession}
              onChange={(e) => setTradesPerSession(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-4 py-3 bg-[#0f1419] border border-gray-800 rounded-xl text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-gray-400 text-sm mb-2">Max Sessions</label>
            <input
              type="number"
              min="1"
              value={maxSessions}
              onChange={(e) => setMaxSessions(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-4 py-3 bg-[#0f1419] border border-gray-800 rounded-xl text-white focus:border-emerald-500 focus:outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              Total trades: {tradesPerSession} × {maxSessions} = {tradesPerSession * maxSessions}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-4 bg-[#0f1419] rounded-xl border border-gray-800">
            <div className="text-gray-400 text-sm mb-1">Risk per Trade</div>
            <div className="text-white font-bold text-xl">{formatCurrency(riskPerTrade)}</div>
          </div>
          <div className="p-4 bg-[#0f1419] rounded-xl border border-gray-800">
            <div className="text-gray-400 text-sm mb-1">Win Profit</div>
            <div className="text-emerald-400 font-bold text-xl">+{formatCurrency(riskPerTrade * 0.92)}</div>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-white font-semibold">Current Session ({currentSession.length}/{tradesPerSession} trades)</h4>
            <div className="flex gap-2">
              <button
                onClick={() => addTrade('win')}
                disabled={currentSession.length >= tradesPerSession || sessions.length >= maxSessions}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
              >
                <Plus className="w-4 h-4" />
                Win
              </button>
              <button
                onClick={() => addTrade('loss')}
                disabled={currentSession.length >= tradesPerSession || sessions.length >= maxSessions}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
              >
                <Plus className="w-4 h-4" />
                Loss
              </button>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            {currentSession.map((trade) => (
              <div
                key={trade.id}
                className={`px-4 py-2 rounded-lg font-semibold ${
                  trade.result === 'win'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                }`}
              >
                {trade.result === 'win' ? 'W' : 'L'}
              </div>
            ))}
          </div>
        </div>

          <div className="flex gap-3">
            <button
              onClick={completeSession}
              disabled={currentSession.length === 0 || sessions.length >= maxSessions}
              className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-colors"
            >
              Complete Session ({sessions.length}/{maxSessions})
            </button>
            <button
              onClick={resetAll}
              className="px-6 py-3 bg-[#0f1419] hover:bg-gray-800 border border-gray-800 text-gray-400 rounded-xl font-medium transition-colors"
            >
              Reset All
            </button>
          </div>
        </div>
      </div>

      {/* Right Column - Stats & History */}
      <div className="lg:col-span-7 space-y-6">
        {sessions.length > 0 && (
          <>
            <div className="bg-[#1a1f2e] border border-gray-800 rounded-2xl p-6">
              <h3 className="text-white font-semibold text-xl mb-4">Risk Summary</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-[#0f1419] rounded-xl p-4 border border-gray-800">
                  <div className="text-gray-400 text-sm mb-1">Total Sessions</div>
                  <div className="text-white text-2xl font-bold">{sessions.length}</div>
                </div>
                <div className="bg-[#0f1419] rounded-xl p-4 border border-gray-800">
                  <div className="text-gray-400 text-sm mb-1">Win Rate</div>
                  <div className="text-emerald-400 text-2xl font-bold">
                    {sessions.reduce((sum, s) => sum + s.trades.length, 0) > 0
                      ? ((sessions.reduce((sum, s) => sum + s.trades.filter(t => t.result === 'win').length, 0) /
                          sessions.reduce((sum, s) => sum + s.trades.length, 0)) * 100).toFixed(1)
                      : '0'}%
                  </div>
                </div>
                <div className="bg-[#0f1419] rounded-xl p-4 border border-gray-800">
                  <div className="text-gray-400 text-sm mb-1">Total Profit</div>
                  <div className={`text-2xl font-bold ${balance - initialBalance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {balance - initialBalance >= 0 ? '+' : ''}{formatCurrency(Math.abs(balance - initialBalance))}
                  </div>
                </div>
                <div className="bg-[#0f1419] rounded-xl p-4 border border-gray-800">
                  <div className="text-gray-400 text-sm mb-1">Account Growth</div>
                  <div className={`text-2xl font-bold ${balance >= initialBalance ? 'text-emerald-400' : 'text-red-400'}`}>
                    {((balance - initialBalance) / initialBalance * 100).toFixed(2)}%
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-[#1a1f2e] border border-gray-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-white font-semibold text-xl">Session History</h3>
                <button
                  onClick={exportSessions}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors font-medium"
                >
                  <Download className="w-4 h-4" />
                  Export
                </button>
              </div>

              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {sessions.map((session) => (
                  <div key={session.id} className="bg-[#0f1419] rounded-xl p-4 border border-gray-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <span className="text-gray-400">Session {session.id}</span>
                        <div className="flex gap-2">
                          {session.trades.map((trade) => (
                            <span
                              key={trade.id}
                              className={`px-3 py-1 rounded-lg text-sm font-semibold ${
                                trade.result === 'win'
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : 'bg-red-500/20 text-red-400'
                              }`}
                            >
                              {trade.result === 'win' ? 'W' : 'L'}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className={`font-semibold ${session.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {session.profit >= 0 ? '+' : ''}{formatCurrency(Math.abs(session.profit))}
                        </div>
                        <div className="text-white font-semibold">{formatCurrency(session.balance)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {showMaxSessionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1f2e] border border-gray-800 rounded-2xl p-8 max-w-md w-full">
            <div className="flex items-center justify-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-full flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-white" />
              </div>
            </div>

            <h3 className="text-2xl font-bold text-white text-center mb-3">
              Maximum Sessions Completed!
            </h3>

            <p className="text-gray-400 text-center mb-6">
              You've completed all {maxSessions} sessions ({tradesPerSession * maxSessions} total trades).
            </p>

            <div className="bg-[#0f1419] rounded-xl p-4 border border-gray-800 mb-6">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <div className="text-gray-400 text-sm mb-1">Final Balance</div>
                  <div className="text-white text-xl font-bold">{formatCurrency(balance)}</div>
                </div>
                <div>
                  <div className="text-gray-400 text-sm mb-1">Total Profit</div>
                  <div className={`text-xl font-bold ${balance - initialBalance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {balance - initialBalance >= 0 ? '+' : ''}{formatCurrency(Math.abs(balance - initialBalance))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mb-3">
              <button
                onClick={() => {
                  exportSessions();
                }}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold transition-colors"
              >
                <Download className="w-4 h-4" />
                Export Data
              </button>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowMaxSessionModal(false)}
                className="flex-1 py-3 bg-[#0f1419] border border-gray-800 text-white rounded-xl font-semibold hover:bg-gray-800 transition-colors"
              >
                Continue Viewing
              </button>
              <button
                onClick={() => {
                  resetAll();
                }}
                className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-semibold transition-colors"
              >
                Start New Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
