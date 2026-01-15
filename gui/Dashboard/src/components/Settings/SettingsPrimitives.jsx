import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export const SettingsSection = ({ title, children, defaultOpen = true }) => {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return (
    <div className="mb-4 rounded-lg border border-border-primary quflx-section-light overflow-hidden quflx-settings-card">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between p-3 text-left hover:bg-white/5 transition-colors"
      >
        <h3 className="text-xs font-bold uppercase tracking-widest text-text-secondary">{title}</h3>
        {isOpen ? <ChevronUp size={14} className="text-text-secondary" /> : <ChevronDown size={14} className="text-text-secondary" />}
      </button>
      {isOpen && <div className="p-4 pt-0 grid grid-cols-1 md:grid-cols-2 gap-6">{children}</div>}
    </div>
  );
};

export const SettingRow = ({ label, description, children }) => (
  <div className="flex flex-col gap-1">
    <div className="flex items-center justify-between">
      <label className="text-sm font-medium text-text-primary">{label}</label>
      <div className="flex items-center">{children}</div>
    </div>
    {description && <p className="text-[11px] text-text-secondary leading-tight">{description}</p>}
  </div>
);

export const SliderInput = ({ value, min, max, step = 1, onChange, unit = '' }) => (
  <div className="flex items-center gap-3 w-48">
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="flex-1 h-1.5 bg-section-bg rounded-lg appearance-none cursor-pointer accent-accent-green"
    />
    <span className="text-xs font-mono text-accent-green min-w-[3rem] text-right">
      {value}{unit}
    </span>
  </div>
);

export const DropdownInput = ({ value, options, onChange }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="bg-card-bg border border-border-primary text-text-primary text-xs rounded focus:ring-accent-green focus:border-accent-green block p-1.5 outline-none shadow-sm dark:shadow-none"
  >
    {options.map((opt) => (
      <option key={opt.value} value={opt.value}>
        {opt.label}
      </option>
    ))}
  </select>
);

export const RadioGroup = ({ value, options, onChange }) => (
  <div className="flex bg-section-bg/50 rounded p-1 border border-border-primary shadow-inner">
    {options.map((opt) => (
      <button
        key={opt.value}
        onClick={() => onChange(opt.value)}
        className={`px-3 py-1 rounded text-[10px] font-bold transition-colors ${
          value === opt.value ? 'bg-accent-green text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
        }`}
      >
        {opt.label}
      </button>
    ))}
  </div>
);
