import React, { useId } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

/**
 * NOTE: SettingsSection is deprecated. Use CollapsiblePanel instead for consistency.
 */
// export const SettingsSection = ({ title, children, defaultOpen = true }) => { ... };

export const SettingRow = ({ label, description, children }) => (
  <div className="flex flex-col gap-1">
    <div className="flex items-center justify-between">
      <label className="text-sm font-medium text-text-primary">{label}</label>
      <div className="flex items-center">{children}</div>
    </div>
    {description && <p className="text-[11px] text-text-secondary leading-tight">{description}</p>}
  </div>
);

export const SliderInput = ({ value, min, max, step = 1, onChange, unit = '', disabled = false, id }) => {
  const uniqueId = useId();
  const inputId = id || `slider-${uniqueId}`;

  return (
    <div className={`flex items-center gap-3 w-48 ${disabled ? 'opacity-60' : ''}`}>
      <input
        id={inputId}
        name={inputId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        disabled={disabled}
        className={`flex-1 h-1.5 bg-section-bg rounded-lg appearance-none accent-accent-green ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'
          }`}
      />
      <span className="text-xs font-mono text-accent-green min-w-[3rem] text-right">
        {value}{unit}
      </span>
    </div>
  );
};

export const DropdownInput = ({ value, options, onChange, disabled = false, id }) => {
  const uniqueId = useId();
  const inputId = id || `dropdown-${uniqueId}`;

  return (
    <select
      id={inputId}
      name={inputId}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`bg-card-bg border border-border-primary text-text-primary text-xs rounded focus:ring-accent-green focus:border-accent-green block p-1.5 outline-none shadow-sm dark:shadow-none ${disabled ? 'opacity-60 cursor-not-allowed' : ''
        }`}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
};

export const RadioGroup = ({ value, options, onChange }) => (
  <div className="flex bg-section-bg/50 rounded p-1 border border-border-primary shadow-inner">
    {options.map((opt) => (
      <button
        key={opt.value}
        onClick={() => onChange(opt.value)}
        className={`px-3 py-1 rounded text-[10px] font-bold transition-colors ${value === opt.value ? 'bg-accent-green text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
          }`}
      >
        {opt.label}
      </button>
    ))}
  </div>
);
