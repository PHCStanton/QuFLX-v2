<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Neumorphic Digital Clock - Fixed Alignment</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&display=swap');

    body {
      margin: 0;
      height: 100vh;
      background: #0a0a12;
      display: grid;
      place-items: center;
      font-family: 'Orbitron', sans-serif;
    }

    .digital-clock {
      position: relative;
      width: 480px;
      padding: 48px 40px 58px;
      background: #111118;
      border-radius: 32px;
      box-shadow: 
        22px 22px 44px #07070c,
       -22px -22px 44px #1b1b24,
        inset 10px 10px 20px rgba(255,255,255,0.04),
        inset -10px -10px 20px rgba(0,0,0,0.65);
      overflow: hidden;
    }

    .display {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      font-size: 7.2rem;
      font-weight: 700;
      letter-spacing: -0.04em;
      color: #ff3366;
      text-shadow: 0 0 35px #ff3366;
      line-height: 1;
    }

    .colon {
      color: #ff3366;
      animation: blink 1s infinite;
      padding-top: 8px;
    }

    @keyframes blink {
      50% { opacity: 0.25; }
    }

    .ampm {
      position: absolute;
      top: 38px;
      right: 48px;
      font-size: 1.45rem;
      font-weight: 600;
      color: #ff3366;
      opacity: 0.75;
      letter-spacing: 3px;
    }

    .date {
      position: absolute;
      bottom: 26px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 1.38rem;
      color: #777;
      letter-spacing: 4px;
      font-weight: 500;
      opacity: 0.85;
    }

    /* Subtle outer glow */
    .digital-clock::before {
      content: '';
      position: absolute;
      inset: -14px;
      background: radial-gradient(circle at center, rgba(255,51,102,0.13), transparent 75%);
      border-radius: 44px;
      z-index: -1;
      pointer-events: none;
    }
  </style>
</head>
<body>

  <div class="digital-clock">
    <div class="display" id="time">12:34</div>
    <div class="ampm" id="ampm">PM</div>
    <div class="date" id="date">MON 06 MARCH 2026</div>
  </div>

  <script>
    function updateClock() {
      const now = new Date();
      
      let hours = now.getHours();
      const minutes = now.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      
      hours = hours % 12;
      hours = hours ? hours : 12;
      const displayHours = hours.toString().padStart(2, '0');

      document.getElementById('time').textContent = `${displayHours}:${minutes}`;
      document.getElementById('ampm').textContent = ampm;

      // Date formatting
      const options = { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' };
      let dateStr = now.toLocaleDateString('en-US', options).toUpperCase();
      dateStr = dateStr.replace(',', ''); // remove comma
      document.getElementById('date').textContent = dateStr;
    }

    setInterval(updateClock, 1000);
    updateClock();
  </script>

</body>
</html>