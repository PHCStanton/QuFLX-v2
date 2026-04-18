import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

export default function AiModelSelector({ value, onChange, providers, size = 'sm', error = null }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const currentProvider = providers.find(p => p.key === value);

  const handleSelect = (providerKey) => {
    onChange(providerKey);
    setIsOpen(false);
  };

  if (!providers.length) {
    // Disabled placeholder chip — user sees "AI routing unavailable" instead of invisible chip
    return (
      <button
        type="button"
        disabled
        className={`
          flex items-center gap-1.5 px-2 py-1 rounded-lg border border-gray-700
          bg-[#0f1419] text-gray-500 text-xs cursor-not-allowed
          ${size === 'md' ? 'px-3 py-1.5 text-sm' : ''}
        `}
        title={error ? error : 'AI providers unavailable — check Gateway connection'}
      >
        <div className="w-2 h-2 rounded-full bg-gray-600" />
        <span>No models</span>
      </button>
    );
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-1.5 px-2 py-1 rounded-lg
          bg-[#0f1419] border border-gray-700 hover:border-gray-600
          transition-all text-xs
          ${size === 'md' ? 'px-3 py-1.5 text-sm' : ''}
        `}
      >
        <div 
          className={`w-2 h-2 rounded-full ${currentProvider?.available ? 'bg-emerald-500' : 'bg-red-500'}`} 
        />
        <span className="text-gray-200 font-medium">
          {currentProvider?.label || value}
        </span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[180px] rounded-xl border border-gray-700 bg-[#0f1419] shadow-xl overflow-hidden">
          {providers.map((provider) => (
            <button
              key={provider.key}
              type="button"
              onClick={() => provider.available && handleSelect(provider.key)}
              disabled={!provider.available}
              className={`
                w-full px-3 py-2.5 text-left text-sm flex items-center gap-2.5
                transition-colors
                ${provider.key === value ? 'bg-purple-500/20 text-purple-200' : 'text-gray-200 hover:bg-gray-800/50'}
                ${!provider.available ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              <div className={`w-2 h-2 rounded-full ${provider.available ? 'bg-emerald-500' : 'bg-red-500'}`} />
              <div className="flex flex-col">
                <span className="font-medium">{provider.label}</span>
                {!provider.available && (
                  <span className="text-[11px] text-gray-500">Unavailable</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}