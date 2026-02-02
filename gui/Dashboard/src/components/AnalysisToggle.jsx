import React from 'react';

const AnalysisToggle = ({ onClick, active, icon: Icon, tooltip, size = 32 }) => {
    const shadowDistance = Math.round(size * 0.1);
    const iconSize = Math.round(size * 0.5);

    return (
        <button
            type="button"
            onClick={onClick}
            className={`neo-toggle-btn ${active ? 'active' : ''}`}
            title={tooltip}
            style={{
                width: `${size}px`,
                height: `${size}px`,
                '--btn-size': `${size}px`,
                '--shadow-dist': `${shadowDistance}px`,
            }}
        >
            <Icon size={iconSize} className="neo-icon" />
            <style>{`
        .neo-toggle-btn {
          --bg: #1e2128;
          --shadow-dark: rgba(0,0,0,0.6);
          --shadow-light: rgba(255,255,255,0.05);
          
          border-radius: 8px; /* Slightly more rounded square than sync button */
          background: var(--bg);
          border: 1px solid rgba(255,255,255,0.05);
          outline: none;
          padding: 0;
          cursor: pointer;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          
          /* Subtle Neomorphic Shadow */
          box-shadow: 
            3px 3px 6px var(--shadow-dark),
            -2px -2px 5px var(--shadow-light);
        }

        .neo-toggle-btn:hover {
          transform: translateY(-1px);
          border-color: rgba(255,255,255,0.1);
        }

        .neo-toggle-btn.active {
          border-color: rgba(0, 255, 136, 0.3); /* Green tint */
          background: linear-gradient(145deg, #1a1d24, #22262e);
           box-shadow: 
            inset 3px 3px 6px var(--shadow-dark),
            inset -2px -2px 5px var(--shadow-light);
        }

        .neo-icon {
          color: #8899ac;
          transition: all 0.3s ease;
        }

        .neo-toggle-btn:hover .neo-icon {
          color: #ccd6e0;
        }

        /* Active Glow Effect */
        .neo-toggle-btn.active .neo-icon {
          color: #00ff88;
          filter: drop-shadow(0 0 4px #00ff88) drop-shadow(0 0 8px rgba(0,255,136,0.4));
        }
      `}</style>
        </button>
    );
};

export default AnalysisToggle;
