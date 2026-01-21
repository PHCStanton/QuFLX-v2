import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import KnowledgeBase from './components/KnowledgeBase';
import DevLogsPage from './components/DevLogsPage';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-dashboard-bg text-white">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/kb" element={<KnowledgeBase />} />
          <Route path="/dev-logs" element={<DevLogsPage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
