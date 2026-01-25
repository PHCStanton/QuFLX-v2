import { useEffect, useState } from 'react';

const IndicatorSettingsModal = ({ isOpen, indicator, onClose, onSave }) => {
  const [localParams, setLocalParams] = useState({});

  useEffect(() => {
    if (!isOpen || !indicator) {
      return;
    }
    const baseParams = indicator.params || {};
    const config = Array.isArray(indicator.paramConfig) ? indicator.paramConfig : [];
    const nextParams = { ...baseParams };
    config.forEach((cfg) => {
      if (
        typeof cfg.name === 'string' &&
        Object.prototype.hasOwnProperty.call(nextParams, cfg.name) === false &&
        Object.prototype.hasOwnProperty.call(cfg, 'default')
      ) {
        nextParams[cfg.name] = cfg.default;
      }
    });
    setLocalParams(nextParams);
  }, [isOpen, indicator]);

  if (!isOpen || !indicator) {
    return null;
  }

  const config = Array.isArray(indicator.paramConfig) ? indicator.paramConfig : [];

  const handleParamChange = (name, rawValue, type) => {
    let nextValue = rawValue;
    if (type === 'number') {
      if (rawValue === '') {
        nextValue = '';
      } else {
        const parsed = Number(rawValue);
        nextValue = Number.isNaN(parsed) ? '' : parsed;
      }
    }
    setLocalParams((prev) => ({
      ...prev,
      [name]: nextValue
    }));
  };

  const badgeLabel = (() => {
    if (!config.length) {
      return indicator.value || '';
    }
    // For RSI, CCI, DeMarker, we usually only want to show the period in the badge
    // unless it's MACD where we show fast,slow,signal
    const primaryParams = config.filter(cfg =>
      cfg.name === 'period' || cfg.name === 'fast' || cfg.name === 'slow' || cfg.name === 'med' || cfg.name === 'signal' || cfg.name === 'k' || cfg.name === 'd'
    );

    const parts = primaryParams.map((cfg) => {
      const raw = localParams[cfg.name];
      if (raw === undefined || raw === null || raw === '') {
        return null;
      }
      return raw;
    });
    if (parts.some((v) => v === null)) {
      return indicator.value || '';
    }
    return parts.join(',');
  })();

  const handleSave = () => {
    const sanitizedParams = {
      ...(indicator.params || {}),
      ...localParams
    };
    const nextValue = badgeLabel || indicator.value || '';
    onSave({ value: nextValue, params: sanitizedParams });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-md mx-4 flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-white">Indicator Settings</span>
            <span className="text-[11px] text-gray-400">{indicator.name}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 text-[11px] rounded bg-gray-800 text-gray-300 border border-gray-600 hover:bg-gray-700"
          >
            Close
          </button>
        </div>
        <div className="p-4 flex flex-col gap-3">
          {config.length > 0 ? (
            <>
              {config.map((cfg) => {
                const value =
                  localParams[cfg.name] !== undefined && localParams[cfg.name] !== null
                    ? String(localParams[cfg.name])
                    : cfg.default !== undefined
                      ? String(cfg.default)
                      : '';
                return (
                  <div key={cfg.name} className="flex flex-col gap-1">
                    <label className="text-xs text-gray-300">{cfg.label}</label>
                    <input
                      type={cfg.type === 'number' ? 'number' : 'text'}
                      value={value}
                      onChange={(e) =>
                        handleParamChange(cfg.name, e.target.value, cfg.type || 'text')
                      }
                      min={cfg.min}
                      max={cfg.max}
                      step={cfg.step || (cfg.type === 'number' ? 1 : undefined)}
                      className="w-full px-2 py-1 text-sm bg-gray-800 border border-gray-600 rounded text-gray-100 focus:outline-none focus:ring-1 focus:ring-accent-green"
                    />
                  </div>
                );
              })}
              <div className="flex flex-col gap-1 pt-1">
                <span className="text-[11px] text-gray-400">Badge label preview</span>
                <span className="text-[11px] text-accent-green font-mono bg-gray-800 px-2 py-1 rounded border border-gray-700">
                  {badgeLabel || 'Default'}
                </span>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-300">No configurable parameters for this indicator.</span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-2 border-t border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 text-[11px] rounded bg-gray-800 text-gray-300 border border-gray-600 hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-3 py-1 text-[11px] rounded bg-accent-green text-black font-semibold hover:bg-emerald-400"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default IndicatorSettingsModal;
