import { useState } from 'react';
import { X, BookOpen, Star } from 'lucide-react';
import { EMOTION_OPTIONS, MARKET_CONDITIONS, JournalEntry, formatDate } from '../lib/calendar-utils';
import { storage } from '../lib/storage';

interface JournalEntryFormProps {
  selectedDate: Date;
  tradingDayId: string | null;
  onEntrySaved: () => void;
  onClose: () => void;
}

export default function JournalEntryForm({ selectedDate, tradingDayId, onEntrySaved, onClose }: JournalEntryFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    entry_type: 'general' as 'pre-market' | 'post-market' | 'general',
    content: '',
    emotion_tags: [] as string[],
    market_conditions: '',
    lessons_learned: '',
    session_quality: 5,
  });

  const toggleEmotion = (emotion: string) => {
    if (formData.emotion_tags.includes(emotion)) {
      setFormData({
        ...formData,
        emotion_tags: formData.emotion_tags.filter(e => e !== emotion),
      });
    } else {
      setFormData({
        ...formData,
        emotion_tags: [...formData.emotion_tags, emotion],
      });
    }
  };

  const handleSave = async () => {
    if (!formData.content.trim()) {
      alert('Please enter some content for your journal entry');
      return;
    }

    setLoading(true);
    try {
      let dayId = tradingDayId;

      if (!dayId) {
        const dateStr = formatDate(selectedDate);
        let tradingDay = storage.getTradingDayByDate(dateStr);
        
        if (!tradingDay) {
          tradingDay = {
            id: Math.random().toString(36).substr(2, 9),
            trade_date: dateStr,
            is_trading_day: false,
            total_profit_loss: 0,
            total_investment: 0,
            win_count: 0,
            loss_count: 0,
            total_trades: 0,
            notes: ''
          };
          storage.saveTradingDay(tradingDay);
          dayId = tradingDay.id;
        } else {
          dayId = tradingDay.id;
        }
      }

      const journalEntry: JournalEntry = {
        id: Math.random().toString(36).substr(2, 9),
        trading_day_id: dayId!,
        ...formData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      storage.saveJournal(journalEntry);

      // Also update the trading day with this quality rating
      if (formData.session_quality) {
        const tradingDay = storage.getTradingDay(dayId!);
        if (tradingDay) {
          storage.saveTradingDay({
            ...tradingDay,
            session_quality: formData.session_quality
          });
        }
      }

      onEntrySaved();
      onClose();
    } catch (error) {
      console.error('Error saving journal entry:', error);
      alert('Failed to save journal entry. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1f2e] border border-gray-800 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Journal Entry</h3>
              <p className="text-sm text-gray-400">{selectedDate.toLocaleDateString()}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-2">Entry Type</label>
            <div className="flex gap-2">
              {['general', 'pre-market', 'post-market'].map((type) => (
                <button
                  key={type}
                  onClick={() => setFormData({ ...formData, entry_type: type as any })}
                  className={`flex-1 py-2 rounded-lg font-semibold transition-colors ${
                    formData.entry_type === type
                      ? 'bg-blue-500 text-white'
                      : 'bg-[#0f1419] text-gray-400 hover:text-white'
                  }`}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1).replace('-', ' ')}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-2">Journal Entry</label>
            <textarea
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              rows={6}
              className="w-full bg-[#0f1419] border border-gray-700 rounded-lg px-4 py-3 text-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Write about your trading day, observations, thoughts..."
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-2">How did you feel?</label>
            <div className="flex flex-wrap gap-2">
              {EMOTION_OPTIONS.map((emotion) => (
                <button
                  key={emotion.value}
                  onClick={() => toggleEmotion(emotion.value)}
                  className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                    formData.emotion_tags.includes(emotion.value)
                      ? `${emotion.color} text-white`
                      : 'bg-[#0f1419] text-gray-400 hover:text-white'
                  }`}
                >
                  {emotion.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-2">Session Quality</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setFormData({ ...formData, session_quality: star })}
                  className="transition-all hover:scale-110"
                >
                  <Star
                    className={`w-8 h-8 ${
                      star <= formData.session_quality
                        ? 'text-yellow-400 fill-yellow-400'
                        : 'text-gray-700'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-2">Market Condition</label>
            <select
              value={formData.market_conditions}
              onChange={(e) => setFormData({ ...formData, market_conditions: e.target.value })}
              className="w-full bg-[#0f1419] border border-gray-700 rounded-lg px-4 py-2 text-white"
            >
              <option value="">Select condition...</option>
              {MARKET_CONDITIONS.map((condition) => (
                <option key={condition} value={condition}>
                  {condition}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-2">Lessons Learned</label>
            <textarea
              value={formData.lessons_learned}
              onChange={(e) => setFormData({ ...formData, lessons_learned: e.target.value })}
              rows={4}
              className="w-full bg-[#0f1419] border border-gray-700 rounded-lg px-4 py-3 text-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="What did you learn today? What would you do differently?"
            />
          </div>
        </div>

        <div className="flex gap-4 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-[#0f1419] border border-gray-700 rounded-lg text-white font-semibold hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 py-3 bg-blue-500 rounded-lg text-white font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Saving...' : 'Save Entry'}
          </button>
        </div>
      </div>
    </div>
  );
}
