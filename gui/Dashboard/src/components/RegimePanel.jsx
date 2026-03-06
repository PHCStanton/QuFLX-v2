import useMarketStore from '../store/marketStore';
import { TrendingUp, TrendingDown, Minus, Activity, ArrowUpDown, AlertTriangle } from 'lucide-react';
import CollapsiblePanel from './CollapsiblePanel';

const FRESHNESS_STYLE = {
  fresh: 'text-green-400  bg-green-500/10  border-green-500/30',
  tested: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  stale: 'text-red-400   bg-red-500/10    border-red-500/30',
};

const RegimePanel = () => {
  const { currentRegime, selectedAsset } = useMarketStore();

  if (!currentRegime || currentRegime.asset !== selectedAsset) {
    return null;
  }

  const { regime, trend, strength, volatility, description, technicals } = currentRegime;

  // S/R enhancement fields from technicals (Phases 1–5)
  const distToRes = technicals?.dist_to_resistance;
  const distToSup = technicals?.dist_to_support;
  const nearSR = technicals?.near_sr || 'None';
  const resTouches = technicals?.resistance_touch_count ?? null;
  const supTouches = technicals?.support_touch_count ?? null;
  const resFreshness = technicals?.resistance_freshness || 'fresh';
  const supFreshness = technicals?.support_freshness || 'fresh';
  const srFlip = technicals?.sr_flip;
  const srFlipPrice = technicals?.sr_flip_price;

  const getTrendIcon = () => {
    if (trend === 'bullish') return <TrendingUp size={14} className="text-green-500" />;
    if (trend === 'bearish') return <TrendingDown size={14} className="text-red-500" />;
    return <Minus size={14} className="text-gray-500" />;
  };

  const getRegimeColor = () => {
    switch (regime) {
      case 'TRENDING': return 'text-blue-400   border-blue-500/30   bg-blue-500/10';
      case 'RANGING': return 'text-yellow-400  border-yellow-500/30 bg-yellow-500/10';
      case 'BREAKOUT': return 'text-purple-400  border-purple-500/30 bg-purple-500/10';
      case 'REVERSAL': return 'text-orange-400  border-orange-500/30 bg-orange-500/10';
      case 'MOMENTUM': return 'text-green-400   border-green-500/30  bg-green-500/10';
      default: return 'text-gray-400    border-gray-500/30   bg-gray-500/10';
    }
  };

  const fmtDist = (v) => (typeof v === 'number' && !isNaN(v) ? `${v.toFixed(3)}%` : '—');
  const hasAnyTechnicals = distToRes != null || distToSup != null || resTouches != null || srFlip;

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
        {/* Regime Badge */}
        <div className={`flex items-center justify-between px-2 py-1 rounded border ${getRegimeColor()}`}>
          <div className="flex items-center gap-1.5">
            <Activity size={14} />
            <span className="text-xs font-bold uppercase tracking-wider">{regime}</span>
          </div>
        </div>

        {/* Trend / Strength / Volatility */}
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
            <span className="text-[10px] font-bold text-gray-300 uppercase">{volatility}</span>
          </div>
        </div>

        {/* ── S/R Intelligence Section (Phases 1–5) ── */}
        {hasAnyTechnicals && (
          <div className="mt-1 pt-1.5 border-t border-white/10 flex flex-col gap-1">
            <div className="flex items-center gap-1 px-0.5">
              <ArrowUpDown size={10} className="text-gray-500" />
              <span className="text-[9px] text-gray-500 uppercase tracking-wide">S/R Intelligence</span>
            </div>

            {/* Distance to nearest level */}
            {(distToRes != null || distToSup != null) && (
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 px-1">
                <div className="flex flex-col">
                  <span className="text-[8px] text-red-400/70 uppercase">▲ Res</span>
                  <span className={`text-[10px] font-mono font-bold ${nearSR === 'Resistance' ? 'text-red-400' : 'text-gray-300'}`}>
                    {fmtDist(distToRes)}
                  </span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[8px] text-green-400/70 uppercase">▼ Sup</span>
                  <span className={`text-[10px] font-mono font-bold ${nearSR === 'Support' ? 'text-green-400' : 'text-gray-300'}`}>
                    {fmtDist(distToSup)}
                  </span>
                </div>
              </div>
            )}

            {/* Touch count + freshness */}
            {(resTouches != null || supTouches != null) && (
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 px-1">
                {/* Resistance */}
                <div className="flex flex-col gap-0.5">
                  <span className="text-[8px] text-red-400/70 uppercase">Res Touches</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-mono font-bold text-gray-200">{resTouches ?? '—'}</span>
                    {resFreshness && (
                      <span className={`text-[7px] px-1 rounded border uppercase font-bold ${FRESHNESS_STYLE[resFreshness] || FRESHNESS_STYLE.fresh}`}>
                        {resFreshness}
                      </span>
                    )}
                  </div>
                </div>
                {/* Support */}
                <div className="flex flex-col gap-0.5 items-end">
                  <span className="text-[8px] text-green-400/70 uppercase">Sup Touches</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-mono font-bold text-gray-200">{supTouches ?? '—'}</span>
                    {supFreshness && (
                      <span className={`text-[7px] px-1 rounded border uppercase font-bold ${FRESHNESS_STYLE[supFreshness] || FRESHNESS_STYLE.fresh}`}>
                        {supFreshness}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* S/R Flip alert badge */}
            {srFlip && (
              <div className="flex items-center gap-1.5 px-1.5 py-1 rounded bg-orange-500/15 border border-orange-500/40">
                <AlertTriangle size={10} className="text-orange-400 flex-shrink-0" />
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-orange-400 uppercase tracking-wide">Level Flipped</span>
                  {srFlipPrice != null && (
                    <span className="text-[8px] font-mono text-orange-300">{srFlipPrice}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Description */}
        {description && (
          <div className="mt-1 pt-2 border-t border-white/10 px-1">
            <p className="text-[9px] text-gray-400 leading-tight italic">{description}</p>
          </div>
        )}
      </CollapsiblePanel>
    </div>
  );
};

export default RegimePanel;

