import useMarketStore from '../store/marketStore';
import { TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';
import CollapsiblePanel from './CollapsiblePanel';

const RegimePanel = () => {
  const { currentRegime, selectedAsset } = useMarketStore();

  if (!currentRegime || currentRegime.asset !== selectedAsset) {
    return null;
  }

  const { regime, trend, strength, volatility, description } = currentRegime;

  const getTrendIcon = () => {
    if (trend === 'bullish') return <TrendingUp size={14} className="text-green-500" />;
    if (trend === 'bearish') return <TrendingDown size={14} className="text-red-500" />;
    return <Minus size={14} className="text-gray-500" />;
  };

  const getRegimeColor = () => {
    switch (regime) {
      case 'TRENDING': return 'text-blue-400 border-blue-500/30 bg-blue-500/10';
      case 'RANGING': return 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10';
      case 'BREAKOUT': return 'text-purple-400 border-purple-500/30 bg-purple-500/10';
      case 'REVERSAL': return 'text-orange-400 border-orange-500/30 bg-orange-500/10';
      case 'MOMENTUM': return 'text-green-400 border-green-500/30 bg-green-500/10';
      default: return 'text-gray-400 border-gray-500/30 bg-gray-500/10';
    }
  };

  return (
    <div className="absolute top-16 left-2 z-20 pointer-events-none select-none min-w-[160px]">
      <CollapsiblePanel
        id="market-regime"
        title="Market Regime"
        className="backdrop-blur-md bg-black/60 border border-white/10 shadow-lg pointer-events-auto"
        headerClassName="px-2 py-1 h-8"
        bodyClassName="p-2 flex flex-col gap-1.5"
        defaultOpen={true}
      >
        <div className={`flex items-center justify-between px-2 py-1 rounded border ${getRegimeColor()}`}>
          <div className="flex items-center gap-1.5">
              <Activity size={14} />
              <span className="text-xs font-bold uppercase tracking-wider">{regime}</span>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-x-2 gap-y-1 px-1">
          <div className="flex flex-col">
               <span className="text-[9px] text-gray-500 uppercase tracking-wide">Trend</span>
               <div className="flex items-center gap-1">
                  <span className={`text-[10px] font-bold uppercase ${trend === 'bullish' ? 'text-green-400' : trend === 'bearish' ? 'text-red-400' : 'text-gray-400'}`}>
                      {trend}
                  </span>
                  {getTrendIcon()}
               </div>
          </div>

          <div className="flex flex-col items-end">
               <span className="text-[9px] text-gray-500 uppercase tracking-wide">Strength</span>
               <span className="text-[10px] font-mono font-bold text-white">
                  {(strength * 100).toFixed(0)}%
               </span>
          </div>
          
           <div className="flex flex-col">
               <span className="text-[9px] text-gray-500 uppercase tracking-wide">Volatility</span>
               <span className="text-[10px] font-bold text-gray-300 uppercase">
                  {volatility}
               </span>
          </div>
        </div>
        
        {description && (
            <div className="mt-1 pt-2 border-t border-white/10 px-1">
                <p className="text-[9px] text-gray-400 leading-tight italic">
                    {description}
                </p>
            </div>
        )}
      </CollapsiblePanel>
    </div>
  );
};

export default RegimePanel;
