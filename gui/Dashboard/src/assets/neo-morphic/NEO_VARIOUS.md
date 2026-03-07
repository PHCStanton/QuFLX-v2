# Neumorphic Glow Buttons

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Neumorphic Glow Buttons</title>
  <style>
    body {
      min-height: 100vh;
      margin: 0;
      background: #0e0e14;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 60px;
      font-family: system-ui, sans-serif;
    }

    .neumorphic-btn {
      --bg: #111118;
      --shadow-dark: #0a0a0f;
      --shadow-light: #1a1a22;
      --accent: #ff3366;     /* change this color to match your theme */
      
      width: 90px;
      height: 90px;
      border: none;
      border-radius: 28px;
      background: var(--bg);
      cursor: pointer;
      position: relative;
      transition: all 0.35s cubic-bezier(0.23, 1, 0.32, 1);
      
      /* Base neumorphism */
      box-shadow: 
        8px 8px 16px var(--shadow-dark),
       -8px -8px 16px var(--shadow-light);
      
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .neumorphic-btn svg {
      width: 42px;
      height: 42px;
      transition: all 0.4s ease;
      fill: #888;
    }

    /* Hover / Active state */
    .neumorphic-btn:hover,
    .neumorphic-btn:focus-visible {
      box-shadow: 
        4px 4px 10px var(--shadow-dark),
       -4px -4px 10px var(--shadow-light),
        0 0 0 4px rgba(255, 51, 102, 0.18); /* outer glow ring */
      
      transform: translateY(-6px);
    }

    .neumorphic-btn:hover svg {
      fill: var(--accent);
      filter: drop-shadow(0 0 12px var(--accent));
    }

    .neumorphic-btn:active {
      transform: translateY(-2px);
      box-shadow: 
        inset 4px 4px 8px var(--shadow-dark),
        inset -4px -4px 8px var(--shadow-light);
    }

    /* Optional: individual accent colors per button */
    .btn-1 { --accent: #ff3366; }   /* pink/red   */
    .btn-2 { --accent: #00d4ff; }   /* cyan       */
    .btn-3 { --accent: #a855f7; }   /* purple     */
  </style>
</head>
<body>

  <!-- Button 1: Play / Media -->
  <button class="neumorphic-btn btn-1" aria-label="Play">
    <svg viewBox="0 0 24 24">
      <path d="M8 5.14v14.72c0 .82.94 1.31 1.64.84l11.25-7.36c.58-.38.58-1.3 0-1.68L9.64 4.3C8.94 3.83 8 4.32 8 5.14z"/>
    </svg>
  </button>

  <!-- Button 2: Settings / Gear -->
  <button class="neumorphic-btn btn-2" aria-label="Settings">
    <svg viewBox="0 0 24 24">
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
    </svg>
  </button>

  <!-- Button 3: Heart / Like -->
  <button class="neumorphic-btn btn-3" aria-label="Like">
    <svg viewBox="0 0 24 24">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
    </svg>
  </button>
</body>
</html>

# Neumorphic Clock - TIME RUNS

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Neumorphic Clock - TIME RUNS</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      min-height: 100vh;
      background: #0d0d12;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-family: system-ui, sans-serif;
      color: #e33;
    }

    .clock {
      position: relative;
      width: 380px;
      height: 380px;
      background: #0d0d12;
      border-radius: 50%;
      /* Neumorphic effect: inset + extruded shadow */
      box-shadow: 
        18px 18px 36px #07070a,
       -18px -18px 36px #13131a;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .clock::before {
      content: '';
      position: absolute;
      inset: 18px;
      background: #0d0d12;
      border-radius: 50%;
      box-shadow: 
        inset 10px 10px 20px #07070a,
        inset -10px -10px 20px #13131a;
      z-index: 1;
    }

    .center-dot {
      position: absolute;
      width: 18px;
      height: 18px;
      background: #e33;
      border-radius: 50%;
      z-index: 20;
      box-shadow: 
        0 0 12px #e33,
        inset 3px 3px 6px rgba(0,0,0,0.7);
    }

    .hand {
      position: absolute;
      transform-origin: bottom center;
      border-radius: 6px 6px 0 0;
      z-index: 10;
      transition: transform 0.05s cubic-bezier(0.1, 2.7, 0.58, 1);
    }

    .hour-hand {
      width: 10px;
      height: 100px;
      background: linear-gradient(to top, #444, #999);
      top: 50%;
      left: 50%;
      transform: translate(-50%, -100%) rotate(0deg);
      box-shadow: 3px 6px 12px rgba(0,0,0,0.6);
    }

    .minute-hand {
      width: 8px;
      height: 130px;
      background: linear-gradient(to top, #555, #ccc);
      top: 50%;
      left: 50%;
      transform: translate(-50%, -100%) rotate(0deg);
      box-shadow: 3px 6px 12px rgba(0,0,0,0.6);
    }

    .second-hand {
      width: 4px;
      height: 150px;
      background: #e33;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -100%) rotate(0deg);
      box-shadow: 0 0 16px #e33, 2px 4px 10px rgba(0,0,0,0.5);
      z-index: 15;
    }

    .number {
      position: absolute;
      font-size: 2.1rem;
      font-weight: bold;
      color: #e33;
      text-shadow: 0 0 10px rgba(227,51,51,0.4);
      z-index: 5;
    }

    /* Position main numbers (12,3,6,9) */
    .number-12 { top: 35px; left: 50%; transform: translateX(-50%); }
    .number-3  { right: 35px; top: 50%; transform: translateY(-50%); }
    .number-6  { bottom: 35px; left: 50%; transform: translateX(-50%); }
    .number-9  { left: 35px; top: 50%; transform: translateY(-50%); }

    /* Small ticks */
    .tick {
      position: absolute;
      width: 2px;
      height: 12px;
      background: #444;
      left: 50%;
      top: 18px;
      transform-origin: center 170px;
    }

    .tick.major {
      height: 20px;
      background: #777;
    }

    .text {
      margin-top: 60px;
      font-size: 2.4rem;
      font-weight: 900;
      letter-spacing: 6px;
      color: #e33;
      text-shadow: 
        0 0 20px rgba(227,51,51,0.5),
        3px 3px 0 #000,
       -3px -3px 0 #000;
    }
  </style>
</head>
<body>

  <div class="clock">
    <div class="center-dot"></div>

    <!-- Hands -->
    <div class="hand hour-hand"   id="hour"></div>
    <div class="hand minute-hand" id="minute"></div>
    <div class="hand second-hand" id="second"></div>

    <!-- Main numbers -->
    <div class="number number-12">12</div>
    <div class="number number-3">3</div>
    <div class="number number-6">6</div>
    <div class="number number-9">9</div>

    <!-- Ticks (every 6°) -->
    <div class="tick" style="transform: rotate(0deg)"></div>
    <div class="tick" style="transform: rotate(6deg)"></div>
    <div class="tick" style="transform: rotate(12deg)"></div>
    <div class="tick" style="transform: rotate(18deg)"></div>
    <div class="tick" style="transform: rotate(24deg)"></div>
    <div class="tick major" style="transform: rotate(30deg)"></div>
    <!-- ... repeated every 30° would be too many lines, so generated via JS below -->
  </div>

  <div class="text">TIME RUNS</div>

  <script>
    const hour   = document.getElementById('hour');
    const minute = document.getElementById('minute');
    const second = document.getElementById('second');

    function setClock() {
      const now = new Date();

      const seconds = now.getSeconds();
      const minutes = now.getMinutes();
      const hours   = now.getHours();

      const secondsDeg = (seconds / 60) * 360 + 90;
      const minutesDeg = (minutes / 60) * 360 + (seconds / 60) * 6 + 90;
      const hoursDeg   = (hours % 12 / 12) * 360 + (minutes / 60) * 30 + 90;

      second.style.transform = `translate(-50%, -100%) rotate(${secondsDeg}deg)`;
      minute.style.transform = `translate(-50%, -100%) rotate(${minutesDeg}deg)`;
      hour  .style.transform = `translate(-50%, -100%) rotate(${hoursDeg}deg)`;
    }

    // Add all 60 ticks dynamically
    const clock = document.querySelector('.clock');
    for (let i = 0; i < 60; i++) {
      const tick = document.createElement('div');
      tick.className = 'tick';
      if (i % 5 === 0) tick.classList.add('major');
      tick.style.transform = `rotate(${i * 6}deg)`;
      clock.appendChild(tick);
    }

    setClock();
    setInterval(setClock, 1000);
  </script>

</body>
</html>

# Shimmer Text Logo – White to Black

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Shimmer Text Logo – White to Black</title>
  <style>
    body {
      margin: 0;
      height: 100vh;
      background: #0a0a15;
      display: grid;
      place-items: center;
      font-family: system-ui, -apple-system, sans-serif;
    }

    .logo-container {
      position: relative;
      cursor: pointer;
      transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .logo-text {
      font-size: 7rem;
      font-weight: 900;
      letter-spacing: -0.05em;

      /* Base gradient: white → black */
      background: linear-gradient(90deg, #ffffff 0%, #000000 100%);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      color: transparent;

      background-size: 200% 100%;
      background-position: 100% 0;
      transition: background-position 1.2s ease;
    }

    /* Shine layer – clipped to text shape */
    .logo-text::after {
      content: attr(data-text);
      position: absolute;
      inset: 0;
      background: linear-gradient(
        100deg,
        transparent 30%,
        rgba(255,255,255,0.9) 48%,
        rgba(255,255,255,0.4) 52%,
        transparent 70%
      );
      background-size: 300% 100%;
      background-position: 150% 0;
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      color: transparent;
      mix-blend-mode: screen;
      opacity: 0;
      pointer-events: none;
      transition: 
        opacity 0.45s ease,
        background-position 1.4s ease;
    }

    .logo-container:hover .logo-text {
      background-position: -100% 0;
    }

    .logo-container:hover .logo-text::after {
      opacity: 1;
      background-position: -120% 0;
    }

    /* Shrink on hover */
    .logo-container {
      transform: scale(1);
    }

    .logo-container:hover {
      transform: scale(0.94);
    }

    /* Optional subtle under-glow */
    .logo-container::before {
      content: "";
      position: absolute;
      inset: -25% -15%;
      background: radial-gradient(circle at 50% 40%, rgba(180,180,180,0.08) 0%, transparent 70%);
      opacity: 0;
      transition: opacity 0.6s ease;
      z-index: -1;
      pointer-events: none;
    }

    .logo-container:hover::before {
      opacity: 0.7;
    }
  </style>
</head>
<body>

  <div class="logo-container">
    <div class="logo-text" data-text="GROK">GROK</div>
  </div>

</body>
</html>