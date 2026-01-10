import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import KnowledgeBase from './components/KnowledgeBase';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-dashboard-bg text-white">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/kb" element={<KnowledgeBase />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
