const NeoSyncButton = ({ onClick, disabled, size = 42, active, linked }) => {
  const shadowDistance = Math.round(size * 0.1);
  const shadowBlur = Math.round(size * 0.2);
  const fontSize = Math.round(size * 0.3);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`neo-sync-btn ${active ? 'active-state' : ''} ${linked ? 'linked' : ''}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        '--btn-size': `${size}px`,
        '--font-size': `${fontSize}px`,
        '--shadow-dist': `${shadowDistance}px`,
        '--shadow-blur': `${shadowBlur}px`,
      }}
      title="Sync TimeFrame"
    >
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <text
          x="50" y="44"
          fontFamily="Arial Black, Impact, sans-serif"
          fontSize="44"
          fontWeight="900"
          textAnchor="middle"
          className="neo-text"
          letterSpacing="0.8">
          SY
        </text>
        <text
          x="50" y="82"
          fontFamily="Arial Black, Impact, sans-serif"
          fontSize="44"
          fontWeight="900"
          textAnchor="middle"
          className="neo-text"
          letterSpacing="0.8">
          NC
        </text>
      </svg>
      <style>{`
        .neo-sync-btn {
          --bg: #1e2128;
          --shadow-dark: rgba(0,0,0,0.82);
          --shadow-light: rgba(60,70,90,0.18);
          
          border-radius: 25%;
          background: var(--bg);
          border: none;
          outline: none;
          padding: 0;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          transition: transform 0.16s ease, box-shadow 0.28s ease;
          box-shadow: 
            var(--shadow-dist) var(--shadow-dist) 16px var(--shadow-dark),
            calc(var(--shadow-dist) * -0.7) calc(var(--shadow-dist) * -0.7) 12px var(--shadow-light);
          
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .neo-sync-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          filter: grayscale(1);
        }

        .neo-sync-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 
            calc(var(--shadow-dist) * 1.2) calc(var(--shadow-dist) * 1.2) 20px rgba(0,0,0,0.9),
            calc(var(--shadow-dist) * -0.8) calc(var(--shadow-dist) * -0.8) 14px rgba(50,60,80,0.22),
            0 0 10px rgba(0,0,0,0.6);
        }

        .neo-sync-btn:active:not(:disabled),
        .neo-sync-btn.active-state {
          transform: translateY(2px);
          box-shadow: 
            inset var(--shadow-dist) var(--shadow-dist) 16px var(--shadow-dark),
            inset calc(var(--shadow-dist) * -0.6) calc(var(--shadow-dist) * -0.6) 10px var(--shadow-light);
        }

        .neo-sync-btn svg {
          width: 85%;
          height: 85%;
          transition: filter 0.25s ease;
          pointer-events: none;
        }

        .neo-text {
          fill: #f0f0f0;
          transition: filter 0.25s ease;
        }

        /* Standard: Glow on Hover (when NOT linked) */
        .neo-sync-btn:not(.linked):hover:not(:disabled) .neo-text {
          filter: drop-shadow(0 0 5px #ffeb3b) drop-shadow(0 0 8px #ffeb3b);
        }

        /* Linked: Glow by Default */
        .neo-sync-btn.linked .neo-text {
          filter: drop-shadow(0 0 5px #00ff88) drop-shadow(0 0 8px #00ff88); /* Green glow for linked? Or user implied yellow? Let's stick to yellow or maybe green for 'linked' context? User said "glow like in hover state", which was yellow. But linked usually implies green/active. I'll stick to yellow to match "like hover state" request exactly. */
          filter: drop-shadow(0 0 5px #ffeb3b) drop-shadow(0 0 8px #ffeb3b);
        }

        /* Linked AND Hover: Remove Glow (Invert) */
        .neo-sync-btn.linked:hover:not(:disabled) .neo-text {
          filter: none;
        }

        /* Subtle inner highlight */
        .neo-sync-btn::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 25%;
          background: linear-gradient(145deg, 
            rgba(255,255,255,0.07) 0%, 
            transparent 50%, 
            rgba(0,0,0,0.04) 100%);
          pointer-events: none;
          opacity: 0.8;
        }
      `}</style>
    </button>
  );
};

export default NeoSyncButton;
