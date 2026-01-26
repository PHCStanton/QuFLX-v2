<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Neomorphic SYNC Button – Yellow Text Glow + Dark Button Hover</title>
  <style>
    body {
      height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      background: #181a20;
      font-family: system-ui, sans-serif;
    }

    .neo-btn {
      --bg: #1e2128;
      --shadow-dark: rgba(0,0,0,0.82);
      --shadow-light: rgba(60,70,90,0.18);
      --radius: 32px;
      --size: 148px;

      width: var(--size);
      height: var(--size);
      border-radius: var(--radius);
      background: var(--bg);
      
      box-shadow: 
        14px 14px 28px var(--shadow-dark),
        -10px -10px 20px var(--shadow-light);
      
      transition: box-shadow 0.28s ease, transform 0.16s ease;
      cursor: pointer;
      border: none;
      outline: none;
      
      display: grid;
      place-items: center;
      position: relative;
      overflow: hidden;
    }

    .neo-btn:hover {
      /* Darker, deeper shadow for button on hover */
      box-shadow: 
        18px 18px 36px rgba(0,0,0,0.9),
        -12px -12px 24px rgba(50,60,80,0.22),
        0 0 16px rgba(0,0,0,0.6);   /* subtle dark outer glow */
      
      transform: translateY(-1px);
    }

    .neo-btn:active {
      box-shadow: 
        inset 12px 12px 24px var(--shadow-dark),
        inset -8px -8px 16px var(--shadow-light);
      transform: translateY(2px);
    }

    .neo-btn svg {
      width: 88%;
      height: 88%;
      transition: filter 0.25s ease;
    }

    /* Yellow glow ONLY on the letters when hovering the button */
    .neo-btn:hover svg {
      filter: drop-shadow(0 0 5px #ffeb3b)
              drop-shadow(0 0 8px #ffeb3b);  /* stronger + softer layer for nice halo */
    }

    /* Optional faint highlight for realism */
    .neo-btn::before {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: var(--radius);
      background: linear-gradient(145deg, 
        rgba(255,255,255,0.07) 0%, 
        transparent 50%, 
        rgba(0,0,0,0.04) 100%);
      pointer-events: none;
      opacity: 0.8;
    }
  </style>
</head>
<body>

  <button class="neo-btn" aria-label="Sync button">
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <!-- Upper: SY -->
      <text 
        x="50" y="44" 
        font-family="Arial Black, Impact, 'Helvetica Neue', sans-serif" 
        font-size="44" 
        font-weight="900" 
        text-anchor="middle" 
        fill="#f0f0f0"
        letter-spacing="0.8">
        SY
      </text>
      
      <!-- Lower: NC -->
      <text 
        x="50" y="82" 
        font-family="Arial Black, Impact, 'Helvetica Neue', sans-serif" 
        font-size="44" 
        font-weight="900" 
        text-anchor="middle" 
        fill="#f0f0f0"
        letter-spacing="0.8">
        NC
      </text>
    </svg>
  </button>

</body>
</html>