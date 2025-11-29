import React from 'react';
import { Menu, Activity, TrendingUp, Bot, Settings } from 'lucide-react';
import useMarketStore from '../store/marketStore';

const Sidebar = () => {
  const { isSidebarOpen, toggleSidebar, activeTab, setActiveTab } = useMarketStore();

  return (
    <div className={`${isSidebarOpen ? 'w-64' : 'w-16'} bg-card-bg border-r border-gray-700 transition-all duration-300 flex flex-col`}>
      <div className="p-4 flex items-center justify-between border-b border-gray-700">
        {isSidebarOpen && <span className="font-bold text-xl text-accent-green">QuFLX</span>}
        <button onClick={toggleSidebar} className="p-1 hover:bg-gray-700 rounded">
          <Menu size={20} />
        </button>
      </div>
      
      <nav className="flex-1 p-2 space-y-2">
        <SidebarItem 
          icon={<Activity />} 
          label="Dashboard" 
          isOpen={isSidebarOpen} 
          active={activeTab === 'dashboard'}
          onClick={() => setActiveTab('dashboard')}
        />
        <SidebarItem 
          icon={<TrendingUp />} 
          label="Analysis" 
          isOpen={isSidebarOpen} 
          active={activeTab === 'analysis'}
          onClick={() => setActiveTab('analysis')}
        />
        <SidebarItem 
          icon={<Bot />} 
          label="Automations" 
          isOpen={isSidebarOpen} 
          active={activeTab === 'automations'}
          onClick={() => setActiveTab('automations')}
        />
        <SidebarItem 
          icon={<Settings />} 
          label="Settings" 
          isOpen={isSidebarOpen} 
          active={activeTab === 'settings'}
          onClick={() => setActiveTab('settings')}
        />
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
    className={`flex items-center gap-3 p-3 rounded cursor-pointer transition-colors ${active ? 'bg-accent-green/10 text-accent-green border-r-2 border-accent-green' : 'hover:bg-gray-700 text-gray-400'}`}
  >
    {React.cloneElement(icon, { size: 20 })}
    {isOpen && <span className="font-medium">{label}</span>}
  </div>
);

export default Sidebar;
