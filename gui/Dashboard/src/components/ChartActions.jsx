import { Bot, Camera } from 'lucide-react';

const ChartActions = ({ onOpenScreenshot, onAskAi, isCapturing, isAsking }) => {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onOpenScreenshot}
        disabled={isCapturing}
        className="flex items-center justify-center w-9 h-9 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-500/40 disabled:opacity-60 disabled:cursor-not-allowed"
        title="Capture chart screenshot"
      >
        <Camera size={18} />
      </button>
      <button
        type="button"
        onClick={onAskAi}
        disabled={isAsking}
        className="quflx-ask-ai flex items-center gap-2 px-4 py-2 rounded text-sm font-bold disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <Bot size={18} />
        <span>{isAsking ? 'Asking…' : 'Ask AI'}</span>
      </button>
    </div>
  );
};

export default ChartActions;

