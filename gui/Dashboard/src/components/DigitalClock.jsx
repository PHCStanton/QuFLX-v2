import { useState, useEffect } from 'react';

const DigitalClock = ({ isSidebarOpen }) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = time.getHours();
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const seconds = time.getSeconds().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  
  let displayHours = hours % 12;
  displayHours = displayHours ? displayHours : 12; // the hour '0' should be '12'
  const displayHoursStr = displayHours.toString().padStart(2, '0');

  const options = { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' };
  let dateStr = time.toLocaleDateString('en-US', options).toUpperCase();
  dateStr = dateStr.replace(/,/g, ''); // remove comma

  if (!isSidebarOpen) {
    // Collapsed state: just show the time stacked, using the theme gradient
    return (
      <div className="quflx-logo flex flex-col items-center justify-center font-orbitron leading-none text-center !w-full">
        <span className="quflx-logo-text-main !text-[11px] !ml-0 font-bold tracking-wider">{displayHoursStr}</span>
        <span className="quflx-logo-text-main !text-[11px] !ml-0 font-bold tracking-wider my-0.5">{minutes}</span>
        <span className="quflx-logo-text-main !text-[11px] !ml-0 font-bold tracking-wider">{seconds}</span>
        <span className="quflx-logo-text-version !text-[8px] !ml-0 mt-0.5 font-semibold opacity-80">{ampm}</span>
      </div>
    );
  }

  // Expanded state: Transparent background, using the Theme CSS variables (via .quflx-logo) 
  // to perfectly match the color, gradient, shadow, and shimmer from the Top Left Corner.
  return (
    <div className="quflx-logo !w-full !flex-col !gap-0 items-center justify-center font-orbitron group bg-transparent relative py-1 px-4 shadow-[0_0_20px_rgba(0,0,0,0.5)] rounded-2xl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_left,var(--logo-glow-bg,rgba(0,224,255,0.1)),transparent_70%)] opacity-30 pointer-events-none rounded-2xl"></div>
      
      {/* Time and AM/PM */}
      <div className="flex items-baseline justify-center gap-0.5 w-full relative z-10 whitespace-nowrap overflow-visible">
        <div className="quflx-logo-text-main !text-2xl !ml-0 font-bold tracking-tight pb-0.5 flex items-baseline">
          <span>{displayHoursStr}</span>
          <span className="animate-pulse mx-0.5 opacity-80" style={{ WebkitTextFillColor: '#ffffff' }}>:</span>
          <span>{minutes}</span>
        </div>
        <div className="quflx-logo-text-main !text-lg !ml-0 font-bold tracking-tight pb-0.5 flex items-baseline opacity-90">
          <span className="animate-pulse mx-[2px] opacity-80" style={{ WebkitTextFillColor: '#ffffff' }}>:</span>
          <span>{seconds}</span>
        </div>
        <span className="quflx-logo-text-version !text-[10px] !ml-1 font-bold tracking-widest">{ampm}</span>
      </div>
      
      {/* Date Row */}
      <div className="mt-0.5 pb-1 quflx-logo-text-version !text-[9px] uppercase font-bold tracking-[0.2em] !ml-0 opacity-85 relative z-10 text-center">
        {dateStr}
      </div>
    </div>
  );
};

export default DigitalClock;
