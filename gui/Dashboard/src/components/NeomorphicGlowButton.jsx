import React from 'react';
import clickSound from '../assets/Sounds/UIClick-Camera_snapshot.mp3';

/**
 * NeomorphicGlowButton - A premium neo-morphic button with glowing effects.
 * Inspired by the design specifications in NEO_VARIOUS.md.
 */
const NeomorphicGlowButton = ({ 
  icon, 
  label, 
  onClick, 
  disabled, 
  active, 
  title, 
  accentColor = '#22c55e', // Default to accent-green (#22c55e)
  className = ""
}) => {
  const handlePress = () => {
    if (disabled) return;
    try {
      const audio = new Audio(clickSound);
      audio.play().catch(() => {});
    } catch(e) {
      // Audio play failed or not supported
    }
    if (onClick) onClick();
  };

  return (
    <button
      type="button"
      onClick={handlePress}
      disabled={disabled}
      title={title}
      className={`group relative flex flex-col items-center justify-center p-3 rounded-[24px] transition-all duration-300 ${
        disabled 
          ? 'opacity-30 cursor-not-allowed grayscale' 
          : 'cursor-pointer hover:-translate-y-1 active:translate-y-0.5'
      } ${className}`}
      style={{
        background: '#111118',
        boxShadow: active 
          ? `inset 6px 6px 12px #07070a, inset -6px -6px 12px #1b1b24, 0 0 20px ${accentColor}44`
          : '10px 10px 20px #07070a, -10px -10px 20px #1b1b24',
        border: active ? `1px solid ${accentColor}66` : '1px solid #ffffff05'
      }}
    >
      {/* Outer Glow Ring on Hover */}
      {!disabled && !active && (
        <div 
          className="absolute inset-0 rounded-[24px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          style={{ boxShadow: `0 0 0 3px ${accentColor}11, 0 0 15px ${accentColor}11` }} 
        />
      )}

      {/* Content Container */}
      <div className={`relative z-10 flex flex-col items-center transition-all duration-300 ${active ? 'scale-95' : 'group-active:scale-95'}`}>
        <div 
          className="transition-all duration-300"
          style={{ 
            color: active ? accentColor : '#a0aec0',
            filter: active ? `drop-shadow(0 0 12px ${accentColor})` : 'none'
          }}
        >
          {icon && React.isValidElement(icon) ? React.cloneElement(icon, { 
            size: 24,
            className: `transition-all duration-300 ${active ? 'scale-110' : 'group-hover:scale-110'}` 
          }) : null}
        </div>
        <span 
          className="text-[9px] mt-2 font-black uppercase tracking-[0.1em] transition-all duration-300 leading-none text-center"
          style={{ 
            color: active ? accentColor : '#718096',
            textShadow: active ? `0 0 8px ${accentColor}44` : 'none'
          }}
        >
          {label}
        </span>
      </div>

      {/* Internal shine / reflection */}
      <div className="absolute inset-0 rounded-[24px] bg-gradient-to-br from-white/5 to-transparent pointer-events-none opacity-50" />
    </button>
  );
};

export default NeomorphicGlowButton;
