import React from 'react';
import Card from './Card';
import { TrendingUp } from 'lucide-react';

const StatsPanel = () => {
  return (
    <Card className="h-40 p-4 rounded-lg grid grid-cols-3 gap-4">
      <StatCard label="Market Condition" value="Volatile" trend="up" />
      <StatCard label="Signal Strength" value="85%" trend="neutral" />
      <StatCard label="Predicted Direction" value="BULLISH" trend="up" color="text-accent-green" />
    </Card>
  );
};

const StatCard = ({ label, value, trend, color }) => (
  <div className="bg-gray-800/50 rounded p-3 border border-gray-700/50 flex flex-col justify-between">
    <span className="text-xs text-gray-400 uppercase">{label}</span>
    <div className="flex items-end justify-between">
      <span className={`text-xl font-bold ${color || 'text-white'}`}>{value}</span>
      {trend === 'up' && <TrendingUp size={16} className="text-accent-green" />}
    </div>
  </div>
);

export default StatsPanel;
