import { Bot, Camera } from 'lucide-react';
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
        <Bot size={18} />
      </button>
    </div>
  );
};

export default ChartActions;
