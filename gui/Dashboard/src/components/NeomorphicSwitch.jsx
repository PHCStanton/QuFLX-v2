import React from 'react';

const NeomorphicSwitch = ({ checked, onChange, leftLabel, rightLabel }) => {
  return (
    <div className="flex flex-col items-center gap-1 group">
      <label className="relative inline-block w-[60px] h-[30px] cursor-pointer select-none">
        <input 
          type="checkbox" 
          className="hidden" 
          checked={checked}
          onChange={onChange}
        />
        {/* Track */}
        <div className={`absolute inset-0 rounded-[15px] transition-all duration-400 shadow-[inset_2px_2px_4px_rgba(0,0,0,0.2),inset_-2px_-2px_4px_rgba(255,255,255,0.5)] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.8),inset_-2px_-2px_4px_rgba(255,255,255,0.05)] group-hover:shadow-[0_0_8px_rgba(var(--accent-glow),0.3)] ${checked ? 'shadow-[0_0_6px_rgba(var(--accent-glow),0.4)]' : ''} quflx-section-light`}>
        </div>
        
        {/* Knob */}
        <div className={`absolute top-[3px] left-[3px] w-[24px] h-[24px] rounded-full transition-all duration-400 cubic-bezier(0.68,-0.55,0.27,1.55) z-10 shadow-[2px_2px_4px_rgba(0,0,0,0.4),-2px_-2px_4px_rgba(255,255,255,0.1)] dark:shadow-[2px_2px_4px_rgba(0,0,0,0.8),-2px_-2px_4px_rgba(255,255,255,0.1)] ${checked ? 'translate-x-[30px] shadow-[2px_2px_4px_rgba(0,0,0,0.4),0_0_6px_rgba(var(--accent-glow),0.6)]' : ''} bg-white dark:bg-gray-800`}>
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-gray-400/20 dark:from-gray-600/20 to-transparent"></div>
        </div>

        {/* Glow */}
        <div className={`absolute top-[-3px] right-[-3px] w-[36px] h-[36px] rounded-full transition-opacity duration-400 pointer-events-none bg-[radial-gradient(circle,rgba(var(--accent-glow),0.4)_0%,transparent_70%)] ${checked ? 'opacity-100' : 'opacity-0'}`}>
        </div>
      </label>
      {(leftLabel || rightLabel) && (
        <div className="flex justify-between w-full px-0.5 text-[8px] font-bold uppercase tracking-tighter text-text-secondary">
          <span className={!checked ? 'text-accent-green' : ''}>{leftLabel}</span>
          <span className={checked ? 'text-accent-green' : ''}>{rightLabel}</span>
        </div>
      )}
    </div>
  );
};

export default NeomorphicSwitch;
