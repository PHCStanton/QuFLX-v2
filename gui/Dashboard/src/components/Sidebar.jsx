import { Menu, Activity, TrendingUp, Bot, Settings } from 'lucide-react';
import useMarketStore from '../store/marketStore';

const SIDEBAR_TABS = [
	{ id: 'dashboard', label: 'Dashboard', icon: Activity },
	{ id: 'analysis', label: 'Analysis', icon: TrendingUp },
	{ id: 'ai_insights', label: 'AI Insights', icon: Bot },
	{ id: 'live_trading', label: 'Live Trading', icon: Activity },
	{ id: 'risk_manager', label: 'Risk Manager', icon: TrendingUp },
	{ id: 'strategy_lab', label: 'Strategy Lab', icon: Bot },
	{ id: 'calendar_journal', label: 'Calendar & Journal', icon: Activity },
	{ id: 'settings', label: 'Settings', icon: Settings }
];

const Sidebar = () => {
  const { isSidebarOpen, toggleSidebar, activeTab, setActiveTab } = useMarketStore();

  return (
	<div className={`${isSidebarOpen ? 'w-64' : 'w-16'} quflx-sidebar bg-card-bg border-r border-gray-700 transition-all duration-300 flex flex-col`}>
      <div className="p-4 flex items-center justify-between border-b border-gray-700">
		{isSidebarOpen && (
		  <div className="quflx-logo flex items-center">
			<div className="quflx-logo-glow" />
			<span className="quflx-logo-text relative font-bold text-xl text-accent-green">QuFLX</span>
		  </div>
		)}
        <button onClick={toggleSidebar} className="p-1 hover:bg-gray-700 rounded">
          <Menu size={20} />
        </button>
      </div>
      
      <nav className="flex-1 p-2 space-y-2">
        {SIDEBAR_TABS.map((tab) => (
          <SidebarItem
            key={tab.id}
            icon={tab.icon}
            label={tab.label}
            isOpen={isSidebarOpen}
            active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          />
        ))}
      </nav>

      <div className="p-4 border-t border-gray-700">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <div className="w-2 h-2 rounded-full bg-accent-green"></div>
          {isSidebarOpen && <span>System Online</span>}
        </div>
      </div>
    </div>
  );
};

const SidebarItem = ({ icon, label, isOpen, active, onClick }) => (
  <div 
    onClick={onClick}
	className={`quflx-sidebar-item flex items-center gap-3 p-3 rounded cursor-pointer transition-colors ${
	  active
		? 'quflx-sidebar-item-active bg-accent-green/10 text-accent-green border-r-2 border-accent-green'
		: 'hover:bg-gray-700 text-gray-400'
	  }`}
  >
	    {icon && <span className="flex items-center justify-center w-5 h-5"><IconWrapper icon={icon} /></span>}
    {isOpen && <span className="font-medium">{label}</span>}
  </div>
);

const IconWrapper = ({ icon: Icon }) => <Icon size={20} />;

export default Sidebar;
