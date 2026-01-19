import { useEffect, useRef } from 'react';
import { AlertCircle, X } from 'lucide-react';
import useMarketStore from '../store/marketStore';

const ErrorToast = () => {
  const { lastError, clearError } = useMarketStore();
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (!lastError) {
      return undefined;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      clearError();
    }, 8000);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [lastError, clearError]);

  if (!lastError) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[360px] max-w-[calc(100vw-2rem)]">
      <div className="bg-card-bg border border-accent-red/60 rounded-lg shadow-xl overflow-hidden">
        <div className="flex items-start gap-3 p-3">
          <div className="mt-0.5 text-accent-red">
            <AlertCircle className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-accent-red uppercase tracking-wider">Error</div>
            <div className="mt-1 text-sm text-text-primary break-words">{String(lastError)}</div>
          </div>
          <button
            type="button"
            onClick={clearError}
            className="p-1 rounded hover:bg-section-bg/50 transition-colors text-text-secondary"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ErrorToast;

