import { Bot, Camera } from 'lucide-react';

const ChartActions = ({ onOpenScreenshot, onAskAi, isCapturing, isAsking }) => {
  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={onOpenScreenshot}
        disabled={isCapturing}
        className="quflx-screenshot-btn disabled:opacity-60 disabled:cursor-not-allowed"
        title="Capture chart screenshot"
      >
        <Camera size={18} />
      </button>
      <button
        type="button"
        onClick={onAskAi}
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
