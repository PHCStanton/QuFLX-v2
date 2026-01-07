import { Camera } from 'lucide-react';
import askAiClickSound from '../assets/Sounds/UIClick-Ai_short.mp3';
import screenshotClickSound from '../assets/Sounds/screenshot.mp3';

const ChartActions = ({ onOpenScreenshot, onAskAi, isCapturing, isAsking }) => {
  const handleScreenshotClick = () => {
    if (isCapturing) return;
    const audio = new Audio(screenshotClickSound);
    audio.play().catch((err) => {
      console.warn('Screenshot click sound failed', err);
    });
    if (onOpenScreenshot) {
      onOpenScreenshot();
    }
  };

  const handleAskAiClick = () => {
    if (isAsking) return;
    const audio = new Audio(askAiClickSound);
    audio.play().catch((err) => {
      console.warn('Ask AI click sound failed', err);
    });
    if (onAskAi) {
      onAskAi();
    }
  };

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
	        onClick={handleScreenshotClick}
        disabled={isCapturing}
        className="quflx-screenshot-btn disabled:opacity-60 disabled:cursor-not-allowed"
        title="Capture chart screenshot"
      >
        <Camera size={18} />
      </button>
      <button
        type="button"
	        onClick={handleAskAiClick}
        disabled={isAsking}
        className="quflx-ai-btn disabled:opacity-60 disabled:cursor-not-allowed"
        title={isAsking ? 'Asking AI…' : 'Ask AI about current market context'}
      >
        <svg width="32" height="32" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="chipGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4a4a4a"/>
              <stop offset="100%" stopColor="#2a2a2a"/>
            </linearGradient>
          </defs>
          
          {/* Connection pins - Top */}
          <rect x="30" y="15" width="5" height="8" rx="1.5" fill="currentColor" opacity="0.6"/>
          <rect x="47" y="8" width="5" height="15" rx="1.5" fill="currentColor" opacity="0.8"/>
          <rect x="65" y="15" width="5" height="8" rx="1.5" fill="currentColor" opacity="0.6"/>
          
          {/* Connection pins - Bottom */}
          <rect x="30" y="77" width="5" height="8" rx="1.5" fill="currentColor" opacity="0.6"/>
          <rect x="47" y="77" width="5" height="15" rx="1.5" fill="currentColor" opacity="0.8"/>
          <rect x="65" y="77" width="5" height="8" rx="1.5" fill="currentColor" opacity="0.6"/>
          
          {/* Connection pins - Left */}
          <rect x="15" y="30" width="8" height="5" rx="1.5" fill="currentColor" opacity="0.6"/>
          <rect x="8" y="47" width="15" height="5" rx="1.5" fill="currentColor" opacity="0.8"/>
          <rect x="15" y="65" width="8" height="5" rx="1.5" fill="currentColor" opacity="0.6"/>
          
          {/* Connection pins - Right */}
          <rect x="77" y="30" width="8" height="5" rx="1.5" fill="currentColor" opacity="0.6"/>
          <rect x="77" y="47" width="15" height="5" rx="1.5" fill="currentColor" opacity="0.8"/>
          <rect x="77" y="65" width="8" height="5" rx="1.5" fill="currentColor" opacity="0.6"/>
          
          {/* Main chip body */}
          <rect x="20" y="20" width="60" height="60" rx="6" fill="url(#chipGradient)" stroke="currentColor" strokeWidth="2"/>
          
          {/* Inner chip detail */}
          <rect x="26" y="26" width="48" height="48" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5"/>
          
          {/* AI Text */}
          <text x="50" y="64" fontFamily="Arial, sans-serif" fontSize="44" fontWeight="bold" fill="currentColor" textAnchor="middle">AI</text>
        </svg>
      </button>
    </div>
  );
};

export default ChartActions;
