import { useState } from 'react';
import { Upload, Plus, X } from 'lucide-react';
import { Trade, TradingDay, formatDate } from '../lib/calendar-utils';
import { storage } from '../lib/storage';
import { parsePocketOptionExcel, parseUploadedCSV } from '../lib/excel-parser';

interface TradeEntryFormProps {
  selectedDate: Date;
  onTradesAdded: () => void;
  onClose: () => void;
}

export default function TradeEntryForm({ selectedDate, onTradesAdded, onClose }: TradeEntryFormProps) {
  const [loading, setLoading] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);
  const [trades, setTrades] = useState<Partial<Trade>[]>([]);
  const [startingBalance, setStartingBalance] = useState('');
  const [endingBalance, setEndingBalance] = useState('');

  const normalizeDecimalInput = (value: string): string => {
    return value.replace(/,/g, '.');
  };

  const [formData, setFormData] = useState({
    asset: '',
    open_time: '',
    close_time: '',
    open_price: '',
    close_price: '',
    investment_amount: '',
    profit_loss: '',
    trade_type: 'CALL',
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      let csvTrades = [];
      if (file.name.endsWith('.xlsx')) {
        csvTrades = await parsePocketOptionExcel(file);
      } else {
        csvTrades = await parseUploadedCSV(file);
      }

      const parsedTrades: Partial<Trade>[] = csvTrades.map(csvTrade => ({
        asset: csvTrade.asset,
        trade_type: csvTrade.direction.toUpperCase() as 'CALL' | 'PUT',
        expiration: csvTrade.expiration,
        open_time: csvTrade.openTime.toISOString(),
        close_time: csvTrade.closeTime.toISOString(),
        open_price: csvTrade.openPrice,
        close_price: csvTrade.closePrice,
        investment_amount: csvTrade.tradeAmount,
        profit_loss: csvTrade.profit,
        result: csvTrade.profit > 0 ? 'WIN' : csvTrade.profit < 0 ? 'LOSS' : 'TIE',
        order_id: csvTrade.order
      }));

      setTrades(parsedTrades);
    } catch (error) {
      console.error('Error parsing file:', error);
      alert('Failed to parse file. Please ensure it\'s in Pocket Option format (.csv or .xlsx).');
    } finally {
      setLoading(false);
    }
  };

  const handleAddManualTrade = () => {
    const profitLoss = parseFloat(formData.profit_loss);
    const investment = parseFloat(formData.investment_amount);

    const newTrade: Partial<Trade> = {
      asset: formData.asset,
      open_time: formData.open_time,
      close_time: formData.close_time,
      open_price: parseFloat(formData.open_price),
      close_price: parseFloat(formData.close_price),
      investment_amount: investment,
      profit_loss: profitLoss,
      profit_loss_percent: (profitLoss / investment) * 100,
      trade_type: formData.trade_type,
      result: profitLoss > 0 ? 'WIN' : profitLoss < 0 ? 'LOSS' : 'BREAKEVEN',
    };

    setTrades([...trades, newTrade]);
    setFormData({
      asset: '',
      open_time: '',
      close_time: '',
      open_price: '',
      close_price: '',
      investment_amount: '',
      profit_loss: '',
      trade_type: 'CALL',
    });
  };

  const handleSaveTrades = async () => {
    if (trades.length === 0) return;

    setLoading(true);
    try {
      const dateStr = formatDate(selectedDate);

      const totalPL = trades.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
      const winCount = trades.filter(t => t.result === 'WIN').length;
      const lossCount = trades.filter(t => t.result === 'LOSS').length;

      const totalInvestment = trades.reduce((sum, t) => sum + (t.investment_amount || 0), 0);
      const tieCount = trades.filter(t => t.result === 'TIE').length;

      // Find or create trading day
      const tradingDay = storage.getTradingDayByDate(dateStr);
      
      const dayData: TradingDay = {
        id: tradingDay?.id || Math.random().toString(36).substr(2, 9),
        trade_date: dateStr,
        is_trading_day: true,
        total_trades: (tradingDay?.total_trades || 0) + trades.length,
        win_count: (tradingDay?.win_count || 0) + winCount,
        loss_count: (tradingDay?.loss_count || 0) + lossCount,
        tie_count: (tradingDay?.tie_count || 0) + tieCount,
        total_profit_loss: (tradingDay?.total_profit_loss || 0) + totalPL,
        total_investment: (tradingDay?.total_investment || 0) + totalInvestment,
        notes: tradingDay?.notes || ''
      };

      if (startingBalance) {
        dayData.starting_balance = parseFloat(startingBalance);
      } else if (tradingDay?.starting_balance) {
        dayData.starting_balance = tradingDay.starting_balance;
      }

      if (endingBalance) {
        dayData.ending_balance = parseFloat(endingBalance);
      } else if (tradingDay?.ending_balance) {
        dayData.ending_balance = tradingDay.ending_balance;
      }

      storage.saveTradingDay(dayData);

      const tradesWithDayId = trades.map(trade => ({
        ...trade,
        id: Math.random().toString(36).substr(2, 9),
        trading_day_id: dayData.id,
      })) as Trade[];

      storage.saveTrades(tradesWithDayId);

      onTradesAdded();
      onClose();
    } catch (error) {
      console.error('Error saving trades:', error);
      alert('Failed to save trades. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1f2e] border border-gray-800 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-white">
            Add Trades for {selectedDate.toLocaleDateString()}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setManualEntry(false)}
            className={`flex-1 py-3 rounded-lg font-semibold transition-colors ${
              !manualEntry
                ? 'bg-emerald-500 text-white'
                : 'bg-[#0f1419] text-gray-400 hover:text-white'
            }`}
          >
            <Upload className="w-5 h-5 inline-block mr-2" />
            Import CSV / XLSX
          </button>
          <button
            onClick={() => setManualEntry(true)}
            className={`flex-1 py-3 rounded-lg font-semibold transition-colors ${
              manualEntry
                ? 'bg-emerald-500 text-white'
                : 'bg-[#0f1419] text-gray-400 hover:text-white'
            }`}
          >
            <Plus className="w-5 h-5 inline-block mr-2" />
            Manual Entry
          </button>
        </div>

        {!manualEntry ? (
          <div className="mb-6">
            <label className="block w-full p-8 border-2 border-dashed border-gray-700 rounded-xl text-center cursor-pointer hover:border-emerald-500 transition-colors">
              <Upload className="w-12 h-12 mx-auto mb-4 text-gray-600" />
              <p className="text-white font-semibold mb-1">Upload CSV or XLSX File</p>
              <p className="text-sm text-gray-400">
                Pocket Option statement format (.csv or .xlsx)
              </p>
              <input
                type="file"
                accept=".csv,.xlsx"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        ) : (
          <div className="space-y-4 mb-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-2">Asset</label>
                <input
                  type="text"
                  value={formData.asset}
                  onChange={(e) => setFormData({ ...formData, asset: e.target.value })}
                  className="w-full bg-[#0f1419] border border-gray-700 rounded-lg px-4 py-2 text-white"
                  placeholder="EUR/USD"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-2">Type</label>
                <select
                  value={formData.trade_type}
                  onChange={(e) => setFormData({ ...formData, trade_type: e.target.value })}
                  className="w-full bg-[#0f1419] border border-gray-700 rounded-lg px-4 py-2 text-white"
                >
                  <option value="CALL">CALL</option>
                  <option value="PUT">PUT</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-2">Open Time</label>
                <input
                  type="datetime-local"
                  value={formData.open_time}
                  onChange={(e) => setFormData({ ...formData, open_time: e.target.value })}
                  className="w-full bg-[#0f1419] border border-gray-700 rounded-lg px-4 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-2">Close Time</label>
                <input
                  type="datetime-local"
                  value={formData.close_time}
                  onChange={(e) => setFormData({ ...formData, close_time: e.target.value })}
                  className="w-full bg-[#0f1419] border border-gray-700 rounded-lg px-4 py-2 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-2">Open Price</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formData.open_price}
                  onChange={(e) => setFormData({ ...formData, open_price: normalizeDecimalInput(e.target.value) })}
                  className="w-full bg-[#0f1419] border border-gray-700 rounded-lg px-4 py-2 text-white"
                  placeholder="1.08234"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-2">Close Price</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formData.close_price}
                  onChange={(e) => setFormData({ ...formData, close_price: normalizeDecimalInput(e.target.value) })}
                  className="w-full bg-[#0f1419] border border-gray-700 rounded-lg px-4 py-2 text-white"
                  placeholder="1.08456"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-2">Investment</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formData.investment_amount}
                  onChange={(e) => setFormData({ ...formData, investment_amount: normalizeDecimalInput(e.target.value) })}
                  className="w-full bg-[#0f1419] border border-gray-700 rounded-lg px-4 py-2 text-white"
                  placeholder="10.00"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-2">Profit/Loss</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formData.profit_loss}
                  onChange={(e) => setFormData({ ...formData, profit_loss: normalizeDecimalInput(e.target.value) })}
                  className="w-full bg-[#0f1419] border border-gray-700 rounded-lg px-4 py-2 text-white"
                  placeholder="9.20 or -10.00"
                />
              </div>
            </div>

            <button
              onClick={handleAddManualTrade}
              className="w-full py-3 bg-[#0f1419] border border-gray-700 rounded-lg text-white font-semibold hover:bg-gray-800 transition-colors"
            >
              <Plus className="w-5 h-5 inline-block mr-2" />
              Add Trade
            </button>
          </div>
        )}

        {trades.length > 0 && (
          <div className="mb-6">
            <h4 className="text-white font-semibold mb-3">{trades.length} Trade(s) Ready to Save</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto mb-4">
              {trades.map((trade, index) => (
                <div key={index} className="bg-[#0f1419] border border-gray-700 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <div className="text-white font-semibold">{trade.asset}</div>
                    <div className="text-sm text-gray-400">
                      {trade.trade_type} • ${trade.investment_amount}
                    </div>
                  </div>
                  <div className={`text-right font-bold ${
                    (trade.profit_loss || 0) > 0 ? 'text-emerald-400' :
                    (trade.profit_loss || 0) < 0 ? 'text-red-400' : 'text-yellow-400'
                  }`}>
                    ${(trade.profit_loss || 0) > 0 ? '+' : ''}{trade.profit_loss?.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-4">
              <h5 className="text-white font-semibold mb-3">Account Balance (Optional)</h5>
              <p className="text-sm text-gray-300 mb-3">
                Enter your actual starting and ending balance from Pocket Option to track discrepancies
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-400 mb-2">Starting Balance</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={startingBalance}
                    onChange={(e) => setStartingBalance(normalizeDecimalInput(e.target.value))}
                    className="w-full bg-[#0f1419] border border-gray-700 rounded-lg px-4 py-2 text-white"
                    placeholder="e.g., 1000.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-400 mb-2">Ending Balance</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={endingBalance}
                    onChange={(e) => setEndingBalance(normalizeDecimalInput(e.target.value))}
                    className="w-full bg-[#0f1419] border border-gray-700 rounded-lg px-4 py-2 text-white"
                    placeholder="e.g., 1050.00"
                  />
                </div>
              </div>
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
            onClick={handleSaveTrades}
            disabled={trades.length === 0 || loading}
            className="flex-1 py-3 bg-emerald-500 rounded-lg text-white font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Saving...' : `Save ${trades.length} Trade(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}
