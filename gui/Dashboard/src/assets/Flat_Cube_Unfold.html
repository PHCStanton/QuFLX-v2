<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Glowing Blue Cube - Mild Explosion on Hover</title>
  <style>
    body {
      margin: 0;
      height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      background: #000;
      perspective: 1400px;
      overflow: hidden;
    }

    .scene {
      width: 280px;
      height: 280px;
      perspective: 1400px;
    }

    .cube {
      width: 100%;
      height: 100%;
      position: relative;
      transform-style: preserve-3d;
      transform: rotateX(45deg) rotateZ(45deg); /* starting position */
      transition: transform 0.9s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    /* Explosion trigger: faces move outward */
    .cube.explode .face {
      transition: transform 0.9s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .scene:hover .cube {
      transform: rotateX(45deg) rotateZ(45deg) scale(1.05);
    }

    .scene:hover .cube.explode .face {
      /* Each face moves outward along its normal direction */
      transform: translateZ(140px) scale(1.12);
    }

    .face {
      position: absolute;
      width: 280px;
      height: 280px;
      background: rgba(0, 110, 255, 0.7);
      border: 2px solid #00e0ff;
      box-shadow: 
        0 0 32px #00e0ff,
        inset 0 0 32px rgba(0, 220, 255, 0.4);
      backdrop-filter: blur(4px);
      transition: 
        box-shadow 0.9s ease,
        transform 0.9s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    /* Base positions (centered) */
    .front  { transform: translateZ(140px); }
    .back   { transform: rotateY(180deg) translateZ(140px); }
    .right  { transform: rotateY( 90deg) translateZ(140px); }
    .left   { transform: rotateY(-90deg) translateZ(140px); }
    .top    { transform: rotateX( 90deg) translateZ(140px); }
    .bottom { transform: rotateX(-90deg) translateZ(140px); }

    /* During hover/explosion: stronger glow */
    .scene:hover .face {
      box-shadow: 
        0 0 60px #00ffff,
        inset 0 0 50px rgba(0, 255, 255, 0.55);
    }

    /* Extra outer energy burst glow */
    .scene::after {
      content: '';
      position: absolute;
      inset: -120px;
      background: radial-gradient(circle at 50% 50%, 
        rgba(0, 240, 255, 0.35) 0%, 
        transparent 65%);
      opacity: 0;
      transition: opacity 1.1s ease;
      pointer-events: none;
      z-index: -1;
    }

    .scene:hover::after {
      opacity: 0.95;
      animation: burst 1.8s ease-out;
    }

    @keyframes burst {
      0%   { transform: scale(0.8); opacity: 0.3; }
      40%  { transform: scale(1.3); opacity: 1; }
      100% { transform: scale(1); opacity: 0.95; }
    }
  </style>
</head>
<body>

  <div class="scene">
    <div class="cube explode">
      <div class="face front"></div>
      <div class="face back"></div>
      <div class="face right"></div>
      <div class="face left"></div>
      <div class="face top"></div>
      <div class="face bottom"></div>
    </div>
  </div>

</body>
</html>