import { useId } from 'react';
import { Camera } from 'lucide-react';
import askAiClickSound from '../assets/Sounds/UIAlert-Positive,_high-tech.mp3';
import screenshotClickSound from '../assets/Sounds/screenshot.mp3';

const ChartActions = ({ onOpenScreenshot, onAskAi, isCapturing, isAsking }) => {
  const chipGradientId = `chipGradient-${useId().replace(/:/g, '')}`;

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
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleScreenshotClick}
        disabled={isCapturing}
        className="quflx-neo-square-btn quflx-neo-square-btn--sm quflx-screenshot-btn text-text-primary disabled:opacity-60 disabled:cursor-not-allowed"
        title="Capture chart screenshot"
      >
        <Camera size={16} />
      </button>
      <button
        type="button"
        onClick={handleAskAiClick}
        disabled={isAsking}
        className="quflx-neo-square-btn quflx-neo-square-btn--sm quflx-neo-square-btn--white quflx-ai-btn disabled:opacity-60 disabled:cursor-not-allowed"
        title={isAsking ? 'Asking AI…' : 'Ask AI about current market context'}
      >
        <svg width="24" height="24" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id={chipGradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#94a3b8" />
              <stop offset="100%" stopColor="#475569" />
            </linearGradient>
          </defs>

          {/* Connection pins - Top */}
          <rect x="32" y="4" width="6" height="10" rx="2" fill="currentColor" opacity="0.4" />
          <rect x="47" y="2" width="6" height="12" rx="2" fill="currentColor" opacity="0.6" />
          <rect x="62" y="4" width="6" height="10" rx="2" fill="currentColor" opacity="0.4" />

          {/* Connection pins - Bottom */}
          <rect x="32" y="86" width="6" height="10" rx="2" fill="currentColor" opacity="0.4" />
          <rect x="47" y="86" width="6" height="12" rx="2" fill="currentColor" opacity="0.6" />
          <rect x="62" y="86" width="6" height="10" rx="2" fill="currentColor" opacity="0.4" />

          {/* Connection pins - Left */}
          <rect x="4" y="32" width="10" height="6" rx="2" fill="currentColor" opacity="0.4" />
          <rect x="2" y="47" width="12" height="6" rx="2" fill="currentColor" opacity="0.6" />
          <rect x="4" y="62" width="10" height="6" rx="2" fill="currentColor" opacity="0.4" />

          {/* Connection pins - Right */}
          <rect x="86" y="32" width="10" height="6" rx="2" fill="currentColor" opacity="0.4" />
          <rect x="86" y="47" width="12" height="6" rx="2" fill="currentColor" opacity="0.6" />
          <rect x="86" y="62" width="10" height="6" rx="2" fill="currentColor" opacity="0.4" />

          {/* Main chip body */}
          <rect x="12" y="12" width="76" height="76" rx="10" fill={`url(#${chipGradientId})`} stroke="currentColor" strokeWidth="1.5" />

          {/* Inner chip detail */}
          <rect x="20" y="20" width="60" height="60" rx="6" fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.2" />

          {/* AI Text */}
          <text
            x="50"
            y="52"
            fontFamily="system-ui, sans-serif"
            fontSize="50"
            fontWeight="900"
            fill="#ffffff"
            textAnchor="middle"
            dominantBaseline="central"
            style={{ letterSpacing: '-0.02em' }}
          >
            AI
          </text>
        </svg>
      </button>
    </div>
  );
};

export default ChartActions;
