import { useState, useEffect } from 'react';
import { BookOpen, Upload, Calendar as CalendarIcon, DollarSign } from 'lucide-react';
import CalendarView from '../components/CalendarView';
import TradeEntryForm from '../components/TradeEntryForm';
import JournalEntryForm from '../components/JournalEntryForm';
import TradingAnalytics from '../components/TradingAnalytics';
import BalanceEditModal from '../components/BalanceEditModal';
import { TradingDay, Trade, JournalEntry, formatDate } from '../lib/calendar-utils';
import { storage } from '../lib/storage';
import ProfileSelector from '../components/ProfileSelector';
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

  const loadData = () => {
    try {
      setLoading(true);
      const days = storage.getTradingDays();
      setTradingDays(days.sort((a, b) => b.trade_date.localeCompare(a.trade_date)));

      const trades = storage.getTrades();
      setAllTrades(trades.sort((a, b) => b.open_time.localeCompare(a.open_time)));
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSelectedDayData = () => {
    const dateStr = formatDate(selectedDate);
    const tradingDay = tradingDays.find(td => td.trade_date === dateStr);

    if (tradingDay) {
      const trades = storage.getTrades(tradingDay.id);
      setSelectedDayTrades(trades.sort((a, b) => b.open_time.localeCompare(a.open_time)));

      const journals = storage.getJournals(tradingDay.id);
      setSelectedDayJournals(journals.sort((a, b) => b.created_at.localeCompare(a.created_at)));
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
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <CalendarIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Trading Calendar</h1>
              <p className="text-gray-400 text-sm">Track your trades and journal your trading journey</p>
            </div>
          </div>

          <div className="flex items-center gap-4 self-start md:self-center">
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
            <ProfileSelector onProfileChanged={loadData} />
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
                          <span className="text-gray-400">Win / Loss / Tie</span>
                          <span className="text-white font-bold">
                            <span className="text-emerald-400">{selectedTradingDay.win_count}</span>
                            <span className="text-gray-500 mx-1">/</span>
                            <span className="text-red-400">{selectedTradingDay.loss_count}</span>
                            <span className="text-gray-500 mx-1">/</span>
                            <span className="text-yellow-400">{selectedTradingDay.tie_count || 0}</span>
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
                              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-2 mt-2">
                                <div className="flex justify-between items-center">
                                  <span className="text-blue-400 text-xs font-semibold">Balance Discrepancy (Payout offsets)</span>
                                  <span className="text-blue-400 text-xs font-mono font-bold">
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
                              <div className="text-white font-semibold text-base">{trade.asset}</div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                                  trade.trade_type === 'CALL' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                                }`}>
                                  {trade.trade_type}
                                </span>
                                <span className="text-xs text-gray-400 font-mono">
                                  {new Date(trade.open_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={`font-black ${
                                trade.result === 'WIN' ? 'text-emerald-400' :
                                trade.result === 'LOSS' ? 'text-red-400' : 'text-yellow-400'
                              }`}>
                                ${trade.profit_loss > 0 ? '+' : ''}{trade.profit_loss.toFixed(2)}
                              </div>
                              <div className="text-[10px] text-gray-500 font-mono mt-1">
                                Vol: ${trade.investment_amount?.toFixed(2) || '0.00'}
                              </div>
                            </div>
                          </div>
                          <div className="mt-2 pt-2 border-t border-gray-800/50 flex justify-between text-[11px] text-gray-400 font-mono">
                            <div className="flex flex-col">
                              <span className="text-gray-500">Entry / Close</span>
                              <span>{trade.open_price || '0.000'} / {trade.close_price || '0.000'}</span>
                            </div>
                            <div className="flex flex-col text-right">
                              <span className="text-gray-500">Expiry</span>
                              <span>{trade.expiration || "N/A"}</span>
                            </div>
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
                          
                          {journal.market_conditions && (
                            <div className="mb-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-400 px-2 py-1 rounded">
                                {journal.market_conditions}
                              </span>
                            </div>
                          )}

                          {journal.emotion_tags && journal.emotion_tags.length > 0 && (
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
