import { useState, useEffect } from 'react';
import { Plus, BookOpen, Upload, Calendar as CalendarIcon, DollarSign } from 'lucide-react';
import CalendarView from '../components/CalendarView';
import TradeEntryForm from '../components/TradeEntryForm';
import JournalEntryForm from '../components/JournalEntryForm';
import TradingAnalytics from '../components/TradingAnalytics';
import BalanceEditModal from '../components/BalanceEditModal';
import { TradingDay, Trade, JournalEntry, formatDate } from '../lib/calendar-utils';
import { supabase } from '../lib/supabase';
import Card from '../components/Card';

export default function TradingCalendar() {
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [tradingDays, setTradingDays] = useState<TradingDay[]>([]);
  const [allTrades, setAllTrades] = useState<Trade[]>([]);
  const [selectedDayTrades, setSelectedDayTrades] = useState<Trade[]>([]);
  const [selectedDayJournals, setSelectedDayJournals] = useState<JournalEntry[]>([]);
  const [showTradeForm, setShowTradeForm] = useState(false);
  const [showJournalForm, setShowJournalForm] = useState(false);
  const [showBalanceEdit, setShowBalanceEdit] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);

      const { data: days, error: daysError } = await supabase
        .from('trading_days')
        .select('*')
        .order('trade_date', { ascending: false });

      if (daysError) throw daysError;
      setTradingDays(days || []);

      const { data: trades, error: tradesError } = await supabase
        .from('trades')
        .select('*')
        .order('open_time', { ascending: false });

      if (tradesError) throw tradesError;
      setAllTrades(trades || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSelectedDayData = async () => {
    const dateStr = formatDate(selectedDate);
    const tradingDay = tradingDays.find(td => td.trade_date === dateStr);

    if (tradingDay) {
      const { data: trades, error: tradesError } = await supabase
        .from('trades')
        .select('*')
        .eq('trading_day_id', tradingDay.id)
        .order('open_time', { ascending: false });

      if (!tradesError) {
        setSelectedDayTrades(trades || []);
      }

      const { data: journals, error: journalsError } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('trading_day_id', tradingDay.id)
        .order('created_at', { ascending: false });

      if (!journalsError) {
        setSelectedDayJournals(journals || []);
      }
    } else {
      setSelectedDayTrades([]);
      setSelectedDayJournals([]);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (tradingDays.length > 0) {
      loadSelectedDayData();
    }
  }, [selectedDate, tradingDays]);

  const selectedTradingDay = tradingDays.find(td => td.trade_date === formatDate(selectedDate));

  const handleAddTrades = () => {
    setShowTradeForm(true);
  };

  const handleAddJournal = () => {
    setShowJournalForm(true);
  };

  const handleDataUpdated = () => {
    loadData();
  };

  return (
    <div className="min-h-screen bg-[#0f1419]">
      <div className="border-b border-gray-800 bg-[#1a1f2e]">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center">
                <CalendarIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Trading Calendar</h1>
                <p className="text-gray-400 text-sm">Track your trades and journal your trading journey</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="inline-flex bg-[#0f1419] border border-gray-800 rounded-xl p-1">
                <button
                  onClick={() => setViewMode('month')}
                  className={`px-4 py-2 rounded-lg font-semibold transition-all text-sm ${
                    viewMode === 'month'
                      ? 'bg-blue-500 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Month
                </button>
                <button
                  onClick={() => setViewMode('week')}
                  className={`px-4 py-2 rounded-lg font-semibold transition-all text-sm ${
                    viewMode === 'week'
                      ? 'bg-blue-500 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Week
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-4 text-gray-400">Loading calendar...</p>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <TradingAnalytics trades={allTrades} tradingDays={tradingDays} />
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2">
                <CalendarView
                  tradingDays={tradingDays}
                  selectedDate={selectedDate}
                  onSelectDate={setSelectedDate}
                  viewMode={viewMode}
                />
              </div>

              <div className="space-y-4">
                <Card>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-white">
                      {selectedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </h3>
                  </div>

                  <div className="space-y-3">
                    <button
                      onClick={handleAddTrades}
                      className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-white font-semibold transition-colors flex items-center justify-center gap-2"
                    >
                      <Upload className="w-5 h-5" />
                      Add Trades
                    </button>

                    <button
                      onClick={handleAddJournal}
                      className="w-full py-3 bg-blue-500 hover:bg-blue-600 rounded-lg text-white font-semibold transition-colors flex items-center justify-center gap-2"
                    >
                      <BookOpen className="w-5 h-5" />
                      Write Journal
                    </button>
                  </div>
                </Card>

                {selectedTradingDay && (
                  <>
                    <Card>
                      <h3 className="text-lg font-bold text-white mb-4">Day Summary</h3>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400">Total Trades</span>
                          <span className="text-white font-bold">{selectedTradingDay.total_trades}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400">Win/Loss</span>
                          <span className="text-white font-bold">
                            {selectedTradingDay.win_count}/{selectedTradingDay.loss_count}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400">P/L</span>
                          <span className={`font-bold ${
                            selectedTradingDay.total_profit_loss > 0 ? 'text-emerald-400' :
                            selectedTradingDay.total_profit_loss < 0 ? 'text-red-400' : 'text-yellow-400'
                          }`}>
                            ${selectedTradingDay.total_profit_loss > 0 ? '+' : ''}
                            {selectedTradingDay.total_profit_loss.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </Card>

                    <Card>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-white">Account Balance</h3>
                        <button
                          onClick={() => setShowBalanceEdit(true)}
                          className="text-sm text-blue-400 hover:text-blue-300 font-semibold transition-colors"
                        >
                          Edit
                        </button>
                      </div>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400">Starting</span>
                          <span className="text-white font-bold font-mono">
                            {selectedTradingDay.starting_balance
                              ? `$${selectedTradingDay.starting_balance.toFixed(2)}`
                              : 'Not set'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400">Ending</span>
                          <span className="text-white font-bold font-mono">
                            {selectedTradingDay.ending_balance
                              ? `$${selectedTradingDay.ending_balance.toFixed(2)}`
                              : 'Not set'}
                          </span>
                        </div>
                        {selectedTradingDay.starting_balance && selectedTradingDay.ending_balance && (
                          <div className="pt-3 border-t border-gray-800">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-gray-400 text-sm">Actual Change</span>
                              <span className={`font-bold font-mono ${
                                (selectedTradingDay.ending_balance - selectedTradingDay.starting_balance) > 0
                                  ? 'text-emerald-400'
                                  : (selectedTradingDay.ending_balance - selectedTradingDay.starting_balance) < 0
                                  ? 'text-red-400'
                                  : 'text-yellow-400'
                              }`}>
                                ${(selectedTradingDay.ending_balance - selectedTradingDay.starting_balance) > 0 ? '+' : ''}
                                {(selectedTradingDay.ending_balance - selectedTradingDay.starting_balance).toFixed(2)}
                              </span>
                            </div>
                            {Math.abs((selectedTradingDay.ending_balance - selectedTradingDay.starting_balance) - selectedTradingDay.total_profit_loss) > 0.01 && (
                              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2">
                                <div className="flex justify-between items-center">
                                  <span className="text-yellow-400 text-xs">Discrepancy</span>
                                  <span className="text-yellow-400 text-xs font-mono">
                                    ${Math.abs((selectedTradingDay.ending_balance - selectedTradingDay.starting_balance) - selectedTradingDay.total_profit_loss).toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => setShowBalanceEdit(true)}
                        className="w-full mt-4 py-2 bg-[#0f1419] border border-gray-700 rounded-lg text-white font-semibold hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
                      >
                        <DollarSign className="w-4 h-4" />
                        Set Balance
                      </button>
                    </Card>
                  </>
                )}

                {selectedDayTrades.length > 0 && (
                  <Card>
                    <h3 className="text-lg font-bold text-white mb-4">Trades ({selectedDayTrades.length})</h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {selectedDayTrades.map(trade => (
                        <div key={trade.id} className="bg-[#0f1419] border border-gray-800 rounded-lg p-3">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <div className="text-white font-semibold">{trade.asset}</div>
                              <div className="text-xs text-gray-400">
                                {new Date(trade.open_time).toLocaleTimeString()}
                              </div>
                            </div>
                            <div className={`text-right font-bold ${
                              trade.result === 'WIN' ? 'text-emerald-400' :
                              trade.result === 'LOSS' ? 'text-red-400' : 'text-yellow-400'
                            }`}>
                              ${trade.profit_loss > 0 ? '+' : ''}{trade.profit_loss.toFixed(2)}
                            </div>
                          </div>
                          <div className="flex justify-between text-xs text-gray-500">
                            <span>{trade.trade_type}</span>
                            <span>${trade.investment_amount.toFixed(2)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {selectedDayJournals.length > 0 && (
                  <Card>
                    <h3 className="text-lg font-bold text-white mb-4">Journal Entries ({selectedDayJournals.length})</h3>
                    <div className="space-y-3 max-h-64 overflow-y-auto">
                      {selectedDayJournals.map(journal => (
                        <div key={journal.id} className="bg-[#0f1419] border border-gray-800 rounded-lg p-3">
                          <div className="text-xs text-gray-400 mb-2">{journal.entry_type}</div>
                          <div className="text-white text-sm mb-2">{journal.content}</div>
                          {journal.emotion_tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {journal.emotion_tags.map(emotion => (
                                <span key={emotion} className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded">
                                  {emotion}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {showTradeForm && (
        <TradeEntryForm
          selectedDate={selectedDate}
          onTradesAdded={handleDataUpdated}
          onClose={() => setShowTradeForm(false)}
        />
      )}

      {showJournalForm && (
        <JournalEntryForm
          selectedDate={selectedDate}
          tradingDayId={selectedTradingDay?.id || null}
          onEntrySaved={handleDataUpdated}
          onClose={() => setShowJournalForm(false)}
        />
      )}

      {showBalanceEdit && selectedTradingDay && (
        <BalanceEditModal
          tradingDay={selectedTradingDay}
          onBalanceUpdated={handleDataUpdated}
          onClose={() => setShowBalanceEdit(false)}
        />
      )}
    </div>
  );
}
