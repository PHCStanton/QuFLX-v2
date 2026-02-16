import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import KnowledgeBase from './components/KnowledgeBase';
import DevLogsPage from './components/DevLogsPage';
import VoiceParticlePage from './components/VoiceParticlePage';
import useSettingsStore from './store/settingsStore';

function App() {
  const { settings, fetchSettings } = useSettingsStore();

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('theme-light', 'theme-dark', 'theme-orange-dark', 'theme-ironman', 'theme-black-white', 'dark');

    const targetTheme = settings.global.theme;

    root.classList.add('dark');
    if (targetTheme === 'dark') {
      root.classList.add('theme-dark');
    }
    if (targetTheme === 'orange-dark') {
      root.classList.add('theme-orange-dark');
    }
    if (targetTheme === 'ironman') {
      root.classList.add('theme-ironman');
    }
    if (targetTheme === 'black-white') {
      root.classList.add('theme-black-white');
    }

    root.style.setProperty('--app-font-size', `${settings.global.fontSize || 13}px`);
  }, [settings.global.theme, settings.global.fontSize]);

  return (
    <Router>
      <div className="min-h-screen bg-dashboard-bg text-white">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/kb" element={<KnowledgeBase />} />
          <Route path="/dev-logs" element={<DevLogsPage />} />
          <Route
            path="/alert-dispatch-logs"
            element={(
              <DevLogsPage
                title="Alert Dispatch Logs"
                description="Monitor scanner heartbeat, staleness, and AI dispatch activity."
                defaultService="alert_dispatch"
                defaultFile=""
                initialFilter=""
                quickFilters={[
                  { label: 'Scanner Pulse', value: 'Scanner Pulse' },
                  { label: 'Heartbeat', value: 'Heartbeat' },
                  { label: 'AI', value: 'AI' },
                  { label: 'Alert dispatched', value: 'Alert dispatched' },
                  { label: 'Error', value: 'error' }
                ]}
                showHeartbeatPanel={true}
              />
            )}
          />
          <Route path="/voice-particle" element={<VoiceParticlePage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
