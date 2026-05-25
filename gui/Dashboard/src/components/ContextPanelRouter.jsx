import { useEffect } from 'react';
import useMarketStore from '../store/marketStore';
import AssetPanel from './AssetPanel';
import AnalysisPanel from './AnalysisPanel';
import AiInsightsPanel from './AiInsightsPanel';
import LiveTradingPanel from './LiveTradingPanel';
import RiskManagerPanel from './RiskManagerPanel';
import CalendarJournalPanel from './CalendarJournalPanel';
import StrategyLabPanel from './StrategyLabPanel';

const TAB_PANEL_CONFIG = {
  analysis: ['analysis-assets', 'analysis-realtime-analytics', 'analysis-monitoring-pool'],
  ai_insights: ['ai-insights-assets', 'ai-insights-main'],
  live_trading: ['lt-trade-form', 'lt-recent-trades', 'live-trading-assets'],
  risk_manager: ['risk-manager-assets', 'risk-manager-main'],
  calendar_journal: ['calendar-journal-main'],
  strategy_lab: ['strategy-lab-header', 'strategy-lab-upload', 'strategy-lab-file-info', 'strategy-lab-market-regime', 'strategy-lab-entry-signals']
};

const ContextPanelRouter = () => {
  const activeTab = useMarketStore((state) => state.activeTab);

  useEffect(() => {
    const handlePanelRetracted = (e) => {
      const { id: retractedId } = e.detail;
      const panelIds = TAB_PANEL_CONFIG[activeTab];
      if (!panelIds) return;

      const idx = panelIds.indexOf(retractedId);
      if (idx !== -1) {
        // Find the first non-retracted panel in the list (global behavior)
        // If there's a panel beneath the retracted one that is NOT retracted,
        // it will naturally expand via flex-grow.
        // If there are multiple, they will share the space.
        
        // Ensure at least one panel is open if all are retracted? 
        // No, the user just wants the "one beneath" to expand.
        
        // We can explicitly signal the next open panel to "refresh" or "expand"
        // to ensure it takes the available space smoothly.
        for (let i = idx + 1; i < panelIds.length; i++) {
          const nextId = panelIds[i];
          const nextState = localStorage.getItem(`quflx-panel-${nextId}`);
          if (nextState !== 'false') {
            window.dispatchEvent(new CustomEvent('quflx-panel-global-retract', {
              detail: { expandId: nextId }
            }));
            break; // Found one to expand
          }
        }
      }
    };

    window.addEventListener('quflx-panel-retracted', handlePanelRetracted);
    return () => window.removeEventListener('quflx-panel-retracted', handlePanelRetracted);
  }, [activeTab]);

  switch (activeTab) {
    case 'analysis':
      return <AnalysisPanel />;
    case 'ai_insights':
      return <AiInsightsPanel />;
    case 'live_trading':
      return <LiveTradingPanel />;
    case 'risk_manager':
      return <RiskManagerPanel />;
    case 'calendar_journal':
      return <CalendarJournalPanel />;
    case 'strategy_lab':
      return <StrategyLabPanel />;
    default:
      return <AssetPanel />;
  }
};

export default ContextPanelRouter;



