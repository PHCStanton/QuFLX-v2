import { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Star } from 'lucide-react';
import { getDaysInMonth, getWeekDays, formatDate, isSameDay, getDayColor, TradingDay } from '../lib/calendar-utils';

interface CalendarViewProps {
  tradingDays: TradingDay[];
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  viewMode: 'month' | 'week';
}

export default function CalendarView({ tradingDays, selectedDate, onSelectDate, viewMode }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(selectedDate);

  const days = viewMode === 'month'
    ? getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth())
    : getWeekDays(currentDate);

  const handlePrevious = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setDate(newDate.getDate() - 7);
    }
    setCurrentDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() + 1);
    } else {
      newDate.setDate(newDate.getDate() + 7);
    }
    setCurrentDate(newDate);
  };

  const handleToday = () => {
    const today = new Date();
    setCurrentDate(today);
    onSelectDate(today);
  };

  const getTradingDay = (date: Date): TradingDay | null => {
    const dateStr = formatDate(date);
    return tradingDays.find(td => td.trade_date === dateStr) || null;
  };

  const isCurrentMonth = (date: Date) => {
    return date.getMonth() === currentDate.getMonth();
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const weekDayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="bg-[#1a1f2e] border border-gray-800 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center">
            <CalendarIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">
              {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h2>
            <p className="text-sm text-gray-400">
              {viewMode === 'month' ? 'Monthly View' : 'Weekly View'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleToday}
            className="px-4 py-2 bg-[#0f1419] border border-gray-700 rounded-lg text-sm text-gray-300 hover:bg-gray-800 transition-colors"
          >
            Today
          </button>
          <button
            onClick={handlePrevious}
            className="p-2 bg-[#0f1419] border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={handleNext}
            className="p-2 bg-[#0f1419] border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className={`grid ${viewMode === 'month' ? 'grid-cols-7' : 'grid-cols-7'} gap-2 mb-2`}>
        {weekDayNames.map(day => (
          <div key={day} className="text-center text-sm font-semibold text-gray-400 py-2">
            {day}
          </div>
        ))}
      </div>

      <div className={`grid ${viewMode === 'month' ? 'grid-cols-7' : 'grid-cols-7'} gap-2`}>
        {days.map((date, index) => {
          const tradingDay = getTradingDay(date);
          const isSelected = isSameDay(date, selectedDate);
          const isToday = isSameDay(date, new Date());
          const isInCurrentMonth = viewMode === 'week' || isCurrentMonth(date);

          return (
            <button
              key={index}
              onClick={() => onSelectDate(date)}
              className={`
                relative min-h-[80px] p-2 rounded-xl border-2 transition-all
                ${isSelected ? 'ring-2 ring-emerald-500' : ''}
                ${isToday ? 'border-blue-500' : 'border-transparent'}
                ${isInCurrentMonth ? getDayColor(tradingDay) : 'bg-[#0f1419] opacity-40'}
                ${isInCurrentMonth ? 'hover:brightness-110' : ''}
              `}
            >
              <div className="text-left">
                <div className={`text-sm font-semibold mb-1 ${
                  isInCurrentMonth ? 'text-white' : 'text-gray-600'
                }`}>
                  {date.getDate()}
                </div>

                {tradingDay && tradingDay.is_trading_day && isInCurrentMonth && (
                  <div className="space-y-1">
                    <div className="text-xs text-gray-400">
                      {tradingDay.total_trades} trade{tradingDay.total_trades !== 1 ? 's' : ''}
                    </div>
                    <div className={`text-xs font-bold ${
                      tradingDay.total_profit_loss > 0 ? 'text-emerald-400' :
                      tradingDay.total_profit_loss < 0 ? 'text-red-400' : 'text-yellow-400'
                    }`}>
                      ${tradingDay.total_profit_loss > 0 ? '+' : ''}
                      {tradingDay.total_profit_loss.toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-500">
                      W:{tradingDay.win_count} L:{tradingDay.loss_count}
                    </div>
                    {tradingDay.session_quality && (
                      <div className="flex gap-0.5 mt-1">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`w-2 h-2 ${
                              i < (tradingDay.session_quality || 0)
                                ? 'text-yellow-400 fill-yellow-400'
                                : 'text-gray-600'
                            }`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex items-center gap-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-emerald-500/20 border-2 border-emerald-500/40 rounded"></div>
          <span className="text-gray-400">Profitable Day</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-red-500/20 border-2 border-red-500/40 rounded"></div>
          <span className="text-gray-400">Loss Day</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-yellow-500/20 border-2 border-yellow-500/40 rounded"></div>
          <span className="text-gray-400">Breakeven Day</span>
        </div>
      </div>
    </div>
  );
}
