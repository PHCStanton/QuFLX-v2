import useMarketStore from '../store/marketStore';
import AssetPanel from './AssetPanel';
import AnalysisPanel from './AnalysisPanel';
import AiInsightsPanel from './AiInsightsPanel';
import LiveTradingPanel from './LiveTradingPanel';
import RiskManagerPanel from './RiskManagerPanel';
import CalendarJournalPanel from './CalendarJournalPanel';
import StrategyLabPanel from './StrategyLabPanel';

const ContextPanelRouter = () => {
  const { activeTab } = useMarketStore();

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

