import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

const Combobox = ({ 
  label, 
  value, 
  onChange, 
  options, 
  placeholder = "Select...", 
  icon: Icon,
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (optionValue) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className="flex flex-col gap-1" ref={containerRef}>
      {label && <label className="text-xs text-text-secondary">{label}</label>}
      <div className="relative">
        <button
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className={`w-full flex items-center justify-between bg-gray-800 border ${isOpen ? 'border-accent-green' : 'border-gray-600'} text-white py-1.5 pl-3 pr-2 rounded text-sm focus:outline-none transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-gray-500'}`}
          disabled={disabled}
        >
          <span className="truncate mr-2">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <div className="flex items-center text-gray-400">
            {Icon && <Icon size={14} className="mr-1" />}
            <ChevronDown size={14} />
          </div>
        </button>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded shadow-lg max-h-60 overflow-y-auto custom-scrollbar">
            {options.map((option) => (
              <div
                key={option.value}
                onClick={() => handleSelect(option.value)}
                className={`px-3 py-2 text-sm cursor-pointer flex items-center justify-between hover:bg-gray-700 ${value === option.value ? 'text-accent-green bg-accent-green/10' : 'text-gray-300'}`}
              >
                <span>{option.label}</span>
                {value === option.value && <Check size={14} />}
              </div>
            ))}
            {options.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-500 text-center">No options</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Combobox;
