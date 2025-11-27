import { useState, useEffect } from 'react';

interface RiskCalculatorProps {
  startingBalance: number;
  setStartingBalance: (value: number) => void;
  riskPercentage: number;
  setRiskPercentage: (value: number) => void;
  numberOfSessions: number;
  setNumberOfSessions: (value: number) => void;
  onCalculate: () => void;
}

export default function RiskCalculator({
  startingBalance,
  setStartingBalance,
  riskPercentage,
  setRiskPercentage,
  numberOfSessions,
  setNumberOfSessions,
  onCalculate
}: RiskCalculatorProps) {
  const [balanceInput, setBalanceInput] = useState(startingBalance.toString());

  useEffect(() => {
    setBalanceInput(startingBalance.toString());
  }, [startingBalance]);

  const normalizeDecimalInput = (value: string): string => {
    return value.replace(/,/g, '.');
  };

  const handleBalanceChange = (value: string) => {
    setBalanceInput(value);
    const normalized = normalizeDecimalInput(value);
    const numValue = parseFloat(normalized);
    if (!isNaN(numValue) && numValue > 0) {
      setStartingBalance(numValue);
    }
  };

  const handleBalanceBlur = () => {
    if (startingBalance > 0) {
      setBalanceInput(startingBalance.toFixed(2));
    }
  };

  const riskPerTrade = startingBalance * (riskPercentage / 100);
  const maxSessionRisk = riskPerTrade * 4;
  const winAmount = riskPerTrade * 0.92;
  const lossAmount = riskPerTrade;

  return (
    <div className="space-y-6">
      <div className="bg-[#1a1f2e] border border-gray-800 rounded-2xl p-6">
        <h3 className="text-white font-semibold text-lg mb-6">Trading Parameters</h3>

        <div className="space-y-5">
          <div>
            <label className="block text-gray-400 text-sm mb-2">Starting Balance</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={balanceInput}
                onChange={(e) => handleBalanceChange(e.target.value)}
                onBlur={handleBalanceBlur}
                className="w-full pl-8 pr-4 py-3 bg-[#0f1419] border border-gray-800 rounded-xl text-white focus:border-emerald-500 focus:outline-none transition-colors"
                placeholder="1000"
              />
            </div>
          </div>

          <div>
            <label className="block text-gray-400 text-sm mb-2">Risk Percentage</label>
            <div className="flex gap-3">
              {[1, 5, 10].map((percent) => (
                <button
                  key={percent}
                  onClick={() => setRiskPercentage(percent)}
                  className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all ${
                    riskPercentage === percent
                      ? 'bg-emerald-500 text-white'
                      : 'bg-[#0f1419] text-gray-400 border border-gray-800 hover:border-gray-700'
                  }`}
                >
                  {percent}%
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-gray-400 text-sm mb-2">Number of Sessions</label>
            <input
              type="number"
              value={numberOfSessions}
              onChange={(e) => setNumberOfSessions(Number(e.target.value))}
              className="w-full px-4 py-3 bg-[#0f1419] border border-gray-800 rounded-xl text-white focus:border-emerald-500 focus:outline-none transition-colors"
              placeholder="10"
              min="1"
              max="100"
            />
          </div>

          <button
            onClick={onCalculate}
            className="w-full py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all transform hover:scale-[1.02] active:scale-[0.98]"
          >
            Generate Session Scenarios
          </button>
        </div>
      </div>

      <div className="bg-[#1a1f2e] border border-gray-800 rounded-2xl p-6">
        <h3 className="text-white font-semibold text-lg mb-6">Risk Summary</h3>

        <div className="space-y-4">
          <div className="flex justify-between items-center p-4 bg-[#0f1419] rounded-xl">
            <span className="text-gray-400">Risk per Trade</span>
            <span className="text-white font-semibold text-lg">${riskPerTrade.toFixed(2)}</span>
          </div>

          <div className="flex justify-between items-center p-4 bg-[#0f1419] rounded-xl">
            <span className="text-gray-400">Max Session Risk (4 trades)</span>
            <span className="text-red-400 font-semibold text-lg">${maxSessionRisk.toFixed(2)}</span>
          </div>

          <div className="flex justify-between items-center p-4 bg-[#0f1419] rounded-xl">
            <span className="text-gray-400">Win Amount (92% payout)</span>
            <span className="text-emerald-400 font-semibold text-lg">+${winAmount.toFixed(2)}</span>
          </div>

          <div className="flex justify-between items-center p-4 bg-[#0f1419] rounded-xl">
            <span className="text-gray-400">Loss Amount</span>
            <span className="text-red-400 font-semibold text-lg">-${lossAmount.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
