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
        <div className={`absolute inset-0 rounded-[15px] transition-all duration-400 shadow-[inset_2px_2px_8px_rgba(0,0,0,0.9)] group-hover:shadow-[inset_2px_2px_8px_rgba(0,0,0,0.9),0_0_12px_rgba(22,8,241,0.4)] ${checked ? 'shadow-[inset_2px_2px_8px_rgba(0,0,0,0.9),0_0_20px_rgba(22,8,241,0.6)]' : ''}`}
             style={{ 
               background: checked 
                 ? `linear-gradient(135deg, rgb(22, 8, 241) 0%, rgba(22, 8, 241, 0.7) 100%)` 
                 : 'rgba(22, 8, 241, 0.1)',
               border: `1px solid rgba(22, 8, 241, ${checked ? '0.6' : '0.2'})`
             }}>
        </div>
        
        {/* Knob */}
        <div className={`absolute top-[3px] left-[3px] w-[24px] h-[24px] rounded-full transition-all duration-400 cubic-bezier(0.68,-0.55,0.27,1.55) z-10 shadow-[3px_3px_6px_rgba(0,0,0,0.8),-1px_-1px_3px_rgba(255,255,255,0.1)] ${checked ? 'translate-x-[30px]' : ''}`}
             style={{ backgroundColor: '#121212' }}>
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/5 to-transparent opacity-30"></div>
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
