interface RiskBadgeProps {
  value: number;
}

export default function RiskBadge({ value }: RiskBadgeProps) {
  const getColor = () => {
    if (value >= 100) return 'bg-red-500/20 text-red-400 border-red-500/30';
    if (value >= 95) return 'bg-red-500/20 text-red-400 border-red-500/30';
    if (value >= 90) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  };

  return (
    <div className={`px-4 py-1.5 rounded-full text-sm font-semibold border ${getColor()}`}>
      {value}%
    </div>
  );
}
