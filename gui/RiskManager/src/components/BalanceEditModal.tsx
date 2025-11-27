import { useState, useEffect } from 'react';
import { X, DollarSign } from 'lucide-react';
import { TradingDay } from '../lib/calendar-utils';
import { supabase } from '../lib/supabase';

interface BalanceEditModalProps {
  tradingDay: TradingDay;
  onBalanceUpdated: () => void;
  onClose: () => void;
}

export default function BalanceEditModal({ tradingDay, onBalanceUpdated, onClose }: BalanceEditModalProps) {
  const [loading, setLoading] = useState(false);
  const [startingBalance, setStartingBalance] = useState(tradingDay.starting_balance?.toString() || '');
  const [endingBalance, setEndingBalance] = useState(tradingDay.ending_balance?.toString() || '');

  const normalizeDecimalInput = (value: string): string => {
    return value.replace(/,/g, '.');
  };

  useEffect(() => {
    setStartingBalance(tradingDay.starting_balance?.toString() || '');
    setEndingBalance(tradingDay.ending_balance?.toString() || '');
  }, [tradingDay]);

  const handleSave = async () => {
    setLoading(true);
    try {
      const updateData: any = {};

      if (startingBalance) {
        const startingVal = parseFloat(startingBalance);
        if (isNaN(startingVal) || startingVal < 0) {
          alert('Please enter a valid starting balance');
          setLoading(false);
          return;
        }
        updateData.starting_balance = startingVal;
      } else {
        updateData.starting_balance = null;
      }

      if (endingBalance) {
        const endingVal = parseFloat(endingBalance);
        if (isNaN(endingVal) || endingVal < 0) {
          alert('Please enter a valid ending balance');
          setLoading(false);
          return;
        }
        updateData.ending_balance = endingVal;
      } else {
        updateData.ending_balance = null;
      }

      const { error } = await supabase
        .from('trading_days')
        .update(updateData)
        .eq('id', tradingDay.id);

      if (error) throw error;

      onBalanceUpdated();
      onClose();
    } catch (error) {
      console.error('Error updating balance:', error);
      alert('Failed to update balance. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const calculatedEndingBalance = tradingDay.starting_balance
    ? tradingDay.starting_balance + tradingDay.total_profit_loss
    : null;

  const actualVsCalculated = tradingDay.ending_balance && calculatedEndingBalance
    ? tradingDay.ending_balance - calculatedEndingBalance
    : null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1f2e] border border-gray-800 rounded-2xl p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-emerald-400" />
            Edit Account Balance
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="mb-6">
          <p className="text-gray-400 text-sm mb-4">
            {new Date(tradingDay.trade_date).toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </p>

          <div className="bg-[#0f1419] border border-gray-800 rounded-lg p-4 mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-400 text-sm">Total Trades</span>
              <span className="text-white font-bold">{tradingDay.total_trades}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Day P/L</span>
              <span className={`font-bold ${
                tradingDay.total_profit_loss > 0 ? 'text-emerald-400' :
                tradingDay.total_profit_loss < 0 ? 'text-red-400' : 'text-yellow-400'
              }`}>
                ${tradingDay.total_profit_loss > 0 ? '+' : ''}
                {tradingDay.total_profit_loss.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-2">
              Starting Balance
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={startingBalance}
              onChange={(e) => setStartingBalance(normalizeDecimalInput(e.target.value))}
              className="w-full bg-[#0f1419] border border-gray-700 rounded-lg px-4 py-3 text-white text-lg"
              placeholder="Enter starting balance"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-2">
              Ending Balance
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={endingBalance}
              onChange={(e) => setEndingBalance(normalizeDecimalInput(e.target.value))}
              className="w-full bg-[#0f1419] border border-gray-700 rounded-lg px-4 py-3 text-white text-lg"
              placeholder="Enter ending balance"
            />
          </div>
        </div>

        {calculatedEndingBalance && endingBalance && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-6">
            <h4 className="text-white font-semibold mb-2 text-sm">Balance Comparison</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Calculated</span>
                <span className="text-white font-mono">${calculatedEndingBalance.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Actual (Pocket Option)</span>
                <span className="text-white font-mono">${parseFloat(endingBalance).toFixed(2)}</span>
              </div>
              {actualVsCalculated !== null && (
                <div className="flex justify-between pt-2 border-t border-gray-700">
                  <span className="text-gray-400">Difference</span>
                  <span className={`font-mono font-bold ${
                    actualVsCalculated > 0 ? 'text-emerald-400' :
                    actualVsCalculated < 0 ? 'text-red-400' : 'text-yellow-400'
                  }`}>
                    ${actualVsCalculated > 0 ? '+' : ''}{actualVsCalculated.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-4">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-[#0f1419] border border-gray-700 rounded-lg text-white font-semibold hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 py-3 bg-emerald-500 rounded-lg text-white font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Saving...' : 'Save Balance'}
          </button>
        </div>
      </div>
    </div>
  );
}
