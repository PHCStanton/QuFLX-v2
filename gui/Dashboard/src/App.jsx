import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import KnowledgeBase from './components/KnowledgeBase';
import DevLogsPage from './components/DevLogsPage';
import VoiceParticlePage from './components/VoiceParticlePage';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-dashboard-bg text-white">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/kb" element={<KnowledgeBase />} />
          <Route path="/dev-logs" element={<DevLogsPage />} />
          <Route path="/voice-particle" element={<VoiceParticlePage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
