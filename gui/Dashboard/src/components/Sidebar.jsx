import React from 'react';
import { Settings, ChevronDown, ChevronUp } from 'lucide-react';
import useMarketStore from '../store/marketStore';
import useSettingsStore from '../store/settingsStore';
import AnimatedLogo from './AnimatedLogo';
import DigitalClock from './DigitalClock';
import '@fontsource/orbitron/500.css';
import '@fontsource/orbitron/700.css';

const Dashboard3Icon = ({ size = 20 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    fill="none"
    aria-hidden="true"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M13 6.5H9c-0.27614 0 -0.5 0.22386 -0.5 0.5v6c0 0.2761 0.22386 0.5 0.5 0.5h4c0.2761 0 0.5 -0.2239 0.5 -0.5V7c0 -0.27614 -0.2239 -0.5 -0.5 -0.5Z"
      strokeWidth="1"
    ></path>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M13 0.5H9c-0.27614 0 -0.5 0.223858 -0.5 0.5v2.01c0 0.27614 0.22386 0.5 0.5 0.5h4c0.2761 0 0.5 -0.22386 0.5 -0.5V1c0 -0.276142 -0.2239 -0.5 -0.5 -0.5Z"
      strokeWidth="1"
    ></path>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M5 0.5H1C0.723858 0.5 0.5 0.723858 0.5 1v6c0 0.27614 0.223858 0.5 0.5 0.5h4c0.27614 0 0.5 -0.22386 0.5 -0.5V1c0 -0.276142 -0.22386 -0.5 -0.5 -0.5Z"
      strokeWidth="1"
    ></path>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M5 10.49H1c-0.276142 0 -0.5 0.2238 -0.5 0.5V13c0 0.2761 0.223858 0.5 0.5 0.5h4c0.27614 0 0.5 -0.2239 0.5 -0.5v-2.01c0 -0.2762 -0.22386 -0.5 -0.5 -0.5Z"
      strokeWidth="1"
    ></path>
  </svg>
);

const SoundRecognitionSearchIcon = ({ size = 20 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M8.75 11.3793V1h2.5v7.83258c-1.0071 0.65642 -1.8619 1.52682 -2.5 2.54672Zm10.5 -3.10276V3h-2.5v4.55913c0.884 0.10692 1.7249 0.35365 2.5 0.71741Zm-4 -0.76267V5h-2.5v3.06105c0.7823 -0.3054 1.6227 -0.49484 2.5 -0.54718ZM0.75 3v14h2.5V3H0.75Zm4 2v10h2.5V5h-2.5Zm10.999 6.999c-2.071 0 -3.75 1.679 -3.75 3.75 0 2.0711 1.679 3.75 3.75 3.75 2.0711 0 3.75 -1.6789 3.75 -3.75 0 -2.071 -1.6789 -3.75 -3.75 -3.75Zm-6.24998 3.75c0 -3.4518 2.79818 -6.24998 6.24998 -6.24998s6.25 2.79818 6.25 6.24998c0 1.2739 -0.3811 2.4587 -1.0355 3.4468l2.9206 2.9205 -1.7678 1.7678 -2.9205 -2.9206c-0.9881 0.6544 -2.1729 1.0355 -3.4468 1.0355 -3.4518 0 -6.24998 -2.7982 -6.24998 -6.25Z"
      clipRule="evenodd"
      strokeWidth="1"
    ></path>
  </svg>
);

const AiInsightsChipBotIcon = ({ size = 20 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    fill="none"
    aria-hidden="true"
  >
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M11.7336 10.9952V9.30799c0.5699 0.02387 0.8554 -0.02887 1.1986 -0.26692 0.3068 -0.21281 0.4088 -0.61411 0.3083 -0.9737 -0.9828 -3.51296 -2.508 -7.06273 -6.90456 -7.06273V12.9952h3.39763c1.10453 0 2.00003 -0.8954 2.00003 -2"
      strokeWidth="1"
    ></path>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9.86719 6.50928v0.16177"
      strokeWidth="1"
    ></path>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.92163 4.0686c0.55172 0 0.86206 -0.31034 0.86206 -0.86206s-0.31034 -0.86206 -0.86206 -0.86206 -0.86206 0.31034 -0.86206 0.86206 0.31034 0.86206 0.86206 0.86206Z"
      strokeWidth="1"
    ></path>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M1.46167 8.09326c0.55172 0 0.86206 -0.31034 0.86206 -0.86206s-0.31034 -0.86206 -0.86206 -0.86206c-0.551719 0 -0.862061 0.31034 -0.862061 0.86206s0.310342 0.86206 0.862061 0.86206Z"
      strokeWidth="1"
    ></path>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.15112 12.1174c0.55172 0 0.86206 -0.3103 0.86206 -0.862s-0.31034 -0.8621 -0.86206 -0.8621 -0.86206 0.3104 -0.86206 0.8621 0.31034 0.862 0.86206 0.862Z"
      strokeWidth="1"
    ></path>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3.78399 3.2063h2.55195"
      strokeWidth="1"
    ></path>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M4.79599 5.38354h1.53995"
      strokeWidth="1"
    ></path>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="m4.6748 11.2554 0 -2.00131 -1.09536 0"
      strokeWidth="1"
    ></path>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3.01398 11.2554h3.32196"
      strokeWidth="1"
    ></path>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.32398 7.23071h4.01196"
      strokeWidth="1"
    ></path>
  </svg>
);

const LiveTradingCandlestickIcon = ({ size = 20 }) => (
  <svg
    width={size}
    height={size}
    viewBox="-0.5 -0.5 16 16"
    fill="none"
    aria-hidden="true"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M2.2230625 10.515375v-1.5076875"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1"
    ></path>
    <path
      d="M7.5 14.284625v-1.5076875"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1"
    ></path>
    <path
      d="M12.7769375 8.253875v-1.50775"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1"
    ></path>
    <path
      d="M2.2230625 4.484624999999999V2.9769375"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1"
    ></path>
    <path
      d="M7.5 8.253875v-1.50775"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1"
    ></path>
    <path
      d="M12.7769375 2.2230625V0.7153750000000001"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1"
    ></path>
    <path
      d="M3.73075 4.9369375v3.6184375c0 0.2498125 -0.2025 0.4523125 -0.4523125 0.4523125H1.1676875c-0.2498125 0 -0.4523125 -0.2025 -0.4523125 -0.4523125V4.9369375c0 -0.2498125 0.2025 -0.4523125 0.4523125 -0.4523125h2.1107500000000003c0.2498125 0 0.4523125 0.2025 0.4523125 0.4523125Z"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1"
    ></path>
    <path
      d="M9.0076875 8.706125v3.6185c0 0.2498125 -0.2025 0.4523125 -0.4523125 0.4523125h-2.1107500000000003c-0.2498125 0 -0.4523125 -0.2025 -0.4523125 -0.4523125v-3.6185c0 -0.2498125 0.2025 -0.45225000000000004 0.4523125 -0.45225000000000004h2.1107500000000003c0.2498125 0 0.4523125 0.20243750000000002 0.4523125 0.45225000000000004Z"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1"
    ></path>
    <path
      d="M14.284625 2.675375v3.6185c0 0.2498125 -0.2025 0.45225000000000004 -0.4523125 0.45225000000000004h-2.1107500000000003c-0.24987499999999999 0 -0.4523125 -0.20243750000000002 -0.4523125 -0.45225000000000004V2.675375c0 -0.2498125 0.20243750000000002 -0.4523125 0.4523125 -0.4523125h2.1107500000000003c0.2498125 0 0.4523125 0.2025 0.4523125 0.4523125Z"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1"
    ></path>
  </svg>
);

const RiskManagerStockIcon = ({ size = 20 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    fill="none"
    aria-hidden="true"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12.25 1.81V0.5"
      strokeWidth="1"
    ></path>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M11 5.31006c0 0.66 0.53 0.88 1.25 0.88s1.25 0 1.25 -0.88c0 -1.31 -2.5 -1.31 -2.5 -2.62 0 -0.88 0.53 -0.88 1.25 -0.88s1.25 0.33 1.25 0.88"
      strokeWidth="1"
    ></path>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12.25 6.18994v1.31"
      strokeWidth="1"
    ></path>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.5 3.5h-1c-0.552285 0 -1 0.44772 -1 1V9c0 0.55228 0.447715 1 1 1h1c0.55228 0 1 -0.44772 1 -1V4.5c0 -0.55228 -0.44772 -1 -1 -1Z"
      strokeWidth="1"
    ></path>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2 10v1.5"
      strokeWidth="1"
    ></path>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2 3.5v-3"
      strokeWidth="1"
    ></path>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M8 7.5H7c-0.55228 0 -1 0.44772 -1 1V10c0 0.5523 0.44772 1 1 1h1c0.55228 0 1 -0.4477 1 -1V8.5c0 -0.55228 -0.44772 -1 -1 -1Z"
      strokeWidth="1"
    ></path>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M7.5 11v2.5"
      strokeWidth="1"
    ></path>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M7.5 7.5V4"
      strokeWidth="1"
    ></path>
  </svg>
);

const StrategyLabFlaskIcon = ({ size = 20 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    fill="none"
    aria-hidden="true"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9.00001 0.5v6L12.59 11.07c0.1749 0.2213 0.2838 0.4874 0.3143 0.7678 0.0305 0.2804 -0.0187 0.5637 -0.1419 0.8174 -0.1232 0.2537 -0.3154 0.4676 -0.5546 0.617 -0.2392 0.1494 -0.5157 0.2284 -0.7978 0.2278H2.59001c-0.28204 0.0006 -0.55854 -0.0784 -0.79776 -0.2278 -0.23921 -0.1494 -0.43146 -0.3633 -0.55466 -0.617 -0.1232 -0.2537 -0.17238 -0.537 -0.14188 -0.8174s0.13943 -0.5465 0.3143 -0.7678l3.59 -4.57v-6"
      strokeWidth="1"
    ></path>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3.5 0.5h7"
      strokeWidth="1"
    ></path>
  </svg>
);

const CalendarJournalEditIcon = ({ size = 20 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    fill="none"
    aria-hidden="true"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M1.5 2c-0.26522 0 -0.51957 0.10536 -0.707107 0.29289C0.605357 2.48043 0.5 2.73478 0.5 3v9.5c0 0.2652 0.105357 0.5196 0.292893 0.7071 0.187537 0.1875 0.441887 0.2929 0.707107 0.2929h11c0.2652 0 0.5196 -0.1054 0.7071 -0.2929s0.2929 -0.4419 0.2929 -0.7071V3c0 -0.26522 -0.1054 -0.51957 -0.2929 -0.70711C13.0196 2.10536 12.7652 2 12.5 2h-2"
      strokeWidth="1"
    ></path>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3.5 0.5v3"
      strokeWidth="1"
    ></path>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M10.5 0.5v3"
      strokeWidth="1"
    ></path>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3.5 2h5"
      strokeWidth="1"
    ></path>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M10 6.86404 5.86842 10.9956 4 11.25l0.26316 -1.86842L8.38596 5.25 10 6.86404Z"
      strokeWidth="1"
    ></path>
  </svg>
);

const SIDEBAR_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: Dashboard3Icon },
  { id: 'analysis', label: 'Analysis', icon: SoundRecognitionSearchIcon },
  { id: 'ai_insights', label: 'AI Insights', icon: AiInsightsChipBotIcon },
  { id: 'live_trading', label: 'Live Trading', icon: LiveTradingCandlestickIcon },
  { id: 'risk_manager', label: 'Risk Manager', icon: RiskManagerStockIcon },
  { id: 'strategy_lab', label: 'Strategy Lab', icon: StrategyLabFlaskIcon },
  { id: 'calendar_journal', label: 'Calendar & Journal', icon: CalendarJournalEditIcon },
  { id: 'settings', label: 'Settings', icon: Settings }
];

const Sidebar = () => {
  const { isSidebarOpen, toggleSidebar, activeTab, setActiveTab } = useMarketStore();
  const sidebarSkinDataUrl = useSettingsStore((s) => s.settings.global.sidebarSkinDataUrl);

  return (
    <div
      className={`${isSidebarOpen ? 'w-64' : 'w-16'} quflx-sidebar bg-card-bg border-r border-border-primary transition-all duration-300 flex flex-col shadow-2xl z-20`}
      style={
        sidebarSkinDataUrl
          ? { '--quflx-sidebar-bg-image': `url("${sidebarSkinDataUrl}")` }
          : undefined
      }
    >
      <div className="p-4 flex items-center justify-between border-b border-border-primary/50">
        {isSidebarOpen && (
          <div className="quflx-logo group cursor-default">
            <AnimatedLogo />
            <div className="quflx-logo-text">
              <span className="quflx-logo-text-main group-hover:text-accent-green transition-colors" data-text="QuFLX">QuFLX</span>
              <span className="quflx-logo-text-version opacity-50 group-hover:opacity-100 transition-opacity" data-text="_v.2">_v.2</span>
            </div>
          </div>
        )}
        <div className="flex items-center gap-1">
          {isSidebarOpen && (
            <div className="flex items-center gap-1.5 mr-1.5">
              <button
                onClick={() => {
                  Object.keys(localStorage)
                    .filter(key => key.startsWith('quflx-panel-'))
                    .forEach(key => localStorage.setItem(key, 'true'));
                  window.dispatchEvent(new Event('storage'));
                  window.dispatchEvent(new CustomEvent('quflx-panels-expand-all'));
                }}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-text-secondary hover:text-text-primary transition-all hover:scale-105 active:scale-95"
                title="Expand all panels"
              >
                <ChevronDown size={15} />
              </button>
              <button
                onClick={() => {
                  Object.keys(localStorage)
                    .filter(key => key.startsWith('quflx-panel-'))
                    .forEach(key => localStorage.setItem(key, 'false'));
                  window.dispatchEvent(new Event('storage'));
                  window.dispatchEvent(new CustomEvent('quflx-panels-collapse-all'));
                }}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-text-secondary hover:text-text-primary transition-all hover:scale-105 active:scale-95"
                title="Collapse all panels"
              >
                <ChevronUp size={15} />
              </button>
            </div>
          )}
          <button onClick={toggleSidebar} className="quflx-neo-square-btn text-text-primary hover:text-accent-green transition-colors" aria-label="Toggle sidebar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" width="20" height="20" aria-hidden="true">
              <path d="M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2H6a2 2 0 0 1 -2 -2z" strokeWidth="2"></path>
              <path d="m9 4 0 16" strokeWidth="2"></path>
            </svg>
          </button>
        </div>
      </div>

      <nav className="flex-1 p-2 space-y-1.5 overflow-y-auto custom-scrollbar">
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

      <div className="py-4 border-t border-border-primary/50 flex justify-start w-full mb-2">
        <DigitalClock isSidebarOpen={isSidebarOpen} />
      </div>
    </div>
  );
};

const SidebarItem = React.memo(({ icon, label, isOpen, active, onClick }) => (
  <div
    onClick={onClick}
    className={`quflx-sidebar-item group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 relative overflow-hidden ${active
        ? 'bg-accent-green/10 text-accent-green shadow-[inset_0_0_12px_rgba(34,197,94,0.1)]'
        : 'hover:bg-white/[0.03] text-text-secondary hover:text-text-primary'
      }`}
  >
    {active && (
      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-accent-green rounded-r-full shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
    )}
    
    <div className={`flex items-center justify-center w-6 h-6 transition-transform duration-200 group-hover:scale-110 ${active ? 'scale-110' : ''}`}>
      <IconWrapper icon={icon} active={active} />
    </div>
    
    {isOpen && (
      <span className={`font-semibold text-[13px] tracking-tight transition-all duration-200 ${active ? 'translate-x-1' : 'group-hover:translate-x-1'}`}>
        {label}
      </span>
    )}

    {!active && (
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-gradient-to-r from-accent-green/5 to-transparent transition-opacity pointer-events-none" />
    )}
  </div>
));

SidebarItem.displayName = 'SidebarItem';

const IconWrapper = ({ icon: Icon, active }) => (
  <Icon size={20} className={`transition-colors duration-200 ${active ? 'stroke-[2px]' : 'stroke-[1.5px]'}`} />
);

export default Sidebar;
