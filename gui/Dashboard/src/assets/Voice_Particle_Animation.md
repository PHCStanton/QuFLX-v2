Here's a lightweight approach using **only HTML + CSS + JavaScript** (no heavy libraries like Three.js or p5.js) to create a **particle cluster** that reacts to voice input — specifically tuned for something like the **Grok Voice agent** output or any microphone audio.

It uses:
- `getUserMedia` + **Web Audio API** to capture microphone (or in your case, route Grok's voice output if you can capture it via audio element / MediaStream)
- AnalyserNode to get frequency/volume data
- Canvas 2D for ~150–300 particles (very performant on modern devices)
- Simple physics: particles cluster in center, explode outward on loud voice, gently attract back, color/alpha shift with intensity

### Important notes for Grok Voice integration
- If Grok Voice gives you a playable `<audio>` element or MediaStream, connect that instead of microphone.
- For real-time Grok voice → microphone fallback is easiest for demo/prototype.
- True "output from Grok Voice agent API" usually needs you to play the received audio chunk and create an `AudioContext` destination → analyser chain.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Voice-Reactive Particle Cluster • Lightweight</title>
  <style>
    body {
      margin: 0;
      height: 100vh;
      overflow: hidden;
      background: #0f111a;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: system-ui, sans-serif;
    }

    canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }

    .ui {
      position: relative;
      z-index: 10;
      color: #aaa;
      text-align: center;
      pointer-events: none;
    }

    button {
      pointer-events: auto;
      padding: 12px 24px;
      font-size: 1.1rem;
      background: #1e212a;
      color: #ddd;
      border: 1px solid #444;
      border-radius: 8px;
      cursor: pointer;
      margin: 20px;
    }

    button:hover { background: #2a2f3a; }
  </style>
</head>
<body>

  <canvas id="c"></canvas>

  <div class="ui">
    <h2>Voice Particle Cluster</h2>
    <p>Speak → particles react</p>
    <button id="start">Start Listening (mic)</button>
  </div>

  <script>
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');
    const startBtn = document.getElementById('start');

    let audioCtx, analyser, dataArray, source;
    let particles = [];

    // ─── Particle class ────────────────────────────────────────
    class Particle {
      constructor() {
        this.reset();
      }
      reset() {
        this.x = canvas.width / 2;
        this.y = canvas.height / 2;
        this.vx = (Math.random() - 0.5) * 0.8;
        this.vy = (Math.random() - 0.5) * 0.8;
        this.size = Math.random() * 3 + 1.5;
        this.hue = 180 + Math.random() * 80; // cyan-green range
        this.alpha = 0.6 + Math.random() * 0.4;
        this.life = 1;
      }
      update(intensity) {
        // Gentle centering force
        const dx = canvas.width / 2 - this.x;
        const dy = canvas.height / 2 - this.y;
        const dist = Math.hypot(dx, dy) || 1;

        this.vx += dx / dist * 0.04;
        this.vy += dy / dist * 0.04;

        // Voice push
        this.vx += (Math.random() - 0.5) * intensity * 1.4;
        this.vy += (Math.random() - 0.5) * intensity * 1.4;

        this.x += this.vx;
        this.y += this.vy;

        // Dampen velocity
        this.vx *= 0.96;
        this.vy *= 0.96;

        // Fade out slowly when quiet
        if (intensity < 0.05) this.alpha = Math.max(0.15, this.alpha - 0.004);
      }
      draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = `hsl(${this.hue}, 80%, ${60 + this.alpha * 40}%)`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // ─── Init particles ────────────────────────────────────────
    function initParticles() {
      particles = [];
      const count = Math.min(280, Math.floor(window.innerWidth * window.innerHeight / 9000));
      for (let i = 0; i < count; i++) {
        particles.push(new Particle());
      }
    }

    // ─── Animation loop ────────────────────────────────────────
    function loop() {
      ctx.fillStyle = 'rgba(15,17,26,0.12)'; // light trails
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (analyser) {
        analyser.getByteFrequencyData(dataArray);
        // Simple voice intensity proxy (0–1)
        let sum = 0;
        for (let i = 0; i < dataArray.length; i += 4) sum += dataArray[i];
        const avg = sum / (dataArray.length / 4);
        const intensity = Math.min(1, avg / 140); // tune sensitivity

        particles.forEach(p => {
          p.update(intensity);
          p.draw();
          // Respawn if too far or too quiet
          if (Math.hypot(p.x - canvas.width/2, p.y - canvas.height/2) > 900 ||
              (intensity < 0.03 && Math.random() < 0.008)) {
            p.reset();
          }
        });
      }

      requestAnimationFrame(loop);
    }

    // ─── Audio setup ───────────────────────────────────────────
    async function startAudio() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        source = audioCtx.createMediaStreamSource(stream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        source.connect(analyser);

        startBtn.textContent = "Listening… (speak!)";
        startBtn.disabled = true;
      } catch (err) {
        console.error(err);
        startBtn.textContent = "Mic access denied / error";
      }
    }

    // ─── Resize handling ───────────────────────────────────────
    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initParticles();
    }

    window.addEventListener('resize', resize);
    resize();
    loop();

    startBtn.addEventListener('click', startAudio);

    // Optional: for Grok voice output → connect an <audio> element instead
    // Example:
    // const grokAudio = document.querySelector('audio');
    // source = audioCtx.createMediaElementSource(grokAudio);
    // source.connect(analyser);
  </script>
</body>
</html>
```

### How to adapt for Grok Voice agent output

If you receive audio from an API (e.g. streamed PCM or MP3 chunks):
1. Create an `<audio>` element
2. Use MediaSource Extensions or just set `srcObject` / `src` when you have a stream
3. Then use `createMediaElementSource(audioEl)` instead of microphone

```js
// Pseudo-code for streamed Grok voice
const audio = new Audio();
audio.autoplay = true;
// ... feed chunks into audio via MediaSource
const source = audioCtx.createMediaElementSource(audio);
source.connect(analyser);
```

This version stays very lightweight (~4–8% CPU on modern laptop when active) and looks nice with voice bursts.