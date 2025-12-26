# NEO MORPHIC BUTTON TEMPLATE

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Neomorphic AI Button with Red Glow</title>
  <style>
    body {
      margin: 0;
      height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      background: #0f172a; /* Dark background to enhance glow */
    }

    .ai-button {
      width: 200px;
      height: 200px;
      border-radius: 50%;
      background: linear-gradient(145deg, #2d3748, #1e293b);
      box-shadow: 
        12px 12px 24px rgba(0, 0, 0, 0.6),
        -12px -12px 24px rgba(255, 255, 255, 0.08),
        0 0 60px rgba(255, 0, 0, 0.3); /* Subtle outer red glow */
      display: flex;
      justify-content: center;
      align-items: center;
      position: relative;
      cursor: pointer;
      transition: all 0.3s ease;
      overflow: hidden;
    }

    .ai-button:hover {
      box-shadow: 
        8px 8px 20px rgba(0, 0, 0, 0.6),
        -8px -8px 20px rgba(255, 255, 255, 0.08),
        0 0 80px rgba(255, 0, 0, 0.5);
      transform: translateY(-4px);
    }

    .ai-button:active {
      box-shadow: 
        inset 10px 10px 20px rgba(0, 0, 0, 0.5),
        inset -10px -10px 20px rgba(255, 255, 255, 0.05),
        0 0 50px rgba(255, 0, 0, 0.4);
      transform: translateY(2px);
    }

    /* "Ai" Icon with red inner glow */
    .ai-icon {
      font-family: 'Arial Black', 'Helvetica Bold', sans-serif;
      font-size: 72px;
      font-weight: 900;
      color: #ffffff;
      text-shadow: 
        0 0 20px #ff0000,
        0 0 40px #ff0000,
        0 0 60px #ff0000,
        0 0 80px #ff0000;
      position: relative;
      z-index: 2;
    }

    /* Extra inner red glow layer */
    .ai-button::before {
      content: '';
      position: absolute;
      width: 120px;
      height: 120px;
      background: radial-gradient(circle, rgba(255, 0, 0, 0.6) 0%, transparent 70%);
      border-radius: 50%;
      filter: blur(20px);
      opacity: 0.8;
      z-index: 1;
    }
  </style>
</head>
<body>
  <div class="ai-button">
    <div class="ai-icon">Ai</div>
  </div>
</body>
</html>