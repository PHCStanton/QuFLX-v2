<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Neomorphic Dark Toggle Switch</title>
  <style>
    body {
      margin: 0;
      height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      background: #1e1e1e; /* Dark background to match your images */
      font-family: system-ui, sans-serif;
    }

    .toggle-container {
      position: relative;
      width: 180px;
      height: 90px;
    }

    /* Hidden checkbox for functionality */
    #toggle {
      display: none;
    }

    /* Track (background of the switch) */
    .track {
      position: absolute;
      inset: 0;
      background: #1e1e1e;
      border-radius: 45px;
      box-shadow: 
        inset 8px 8px 16px #121212,
        inset -8px -8px 16px #2a2a2a;
      transition: all 0.4s ease;
    }

    /* Knob (the sliding circle) */
    .knob {
      position: absolute;
      top: 8px;
      left: 8px;
      width: 74px;
      height: 74px;
      background: #1e1e1e;
      border-radius: 50%;
      box-shadow: 
        6px 6px 12px #121212,
        -6px -6px 12px #2a2a2a;
      transition: all 0.4s cubic-bezier(0.68, -0.55, 0.27, 1.55);
      z-index: 2;
    }

    /* Glow effect when ON */
    .glow {
      position: absolute;
      top: -10px;
      right: -10px;
      width: 94px;
      height: 94px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(255, 80, 0, 0.4) 0%, transparent 70%);
      opacity: 0;
      transition: opacity 0.4s ease;
      pointer-events: none;
    }

    /* When toggle is checked (ON state) */
    #toggle:checked + .track {
      box-shadow: 
        inset 8px 8px 16px #121212,
        inset -8px -8px 16px #2a2a2a,
        0 0 20px rgba(255, 80, 0, 0.3);
    }

    #toggle:checked ~ .knob {
      transform: translateX(90px);
      box-shadow: 
        6px 6px 12px #121212,
        -6px -6px 12px #2a2a2a,
        0 0 20px rgba(255, 80, 0, 0.5);
    }

    #toggle:checked ~ .glow {
      opacity: 1;
    }

    /* Optional: subtle press effect on click */
    .toggle-container:active .knob {
      transform: scale(0.95) !important;
    }
  </style>
</head>
<body>

  <label class="toggle-container">
    <input type="checkbox" id="toggle">
    <div class="track"></div>
    <div class="knob"></div>
    <div class="glow"></div>
  </label>

</body>
</html>