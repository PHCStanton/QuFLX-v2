import { useRef, useState, useEffect } from 'react';
import understandingOtcMarketsSound from '../assets/Sounds/Understanding_OTC_Markets.mp3';

const VoiceParticlePage = () => {
    const canvasRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef(null);
    const sourceRef = useRef(null);
    const audioCtxRef = useRef(null);
    const analyserRef = useRef(null);
    const animationFrameRef = useRef(null);
    const particlesRef = useRef([]);

    // --- Particle Class ---
    class Particle {
        constructor(canvas) {
            this.canvas = canvas;
            this.reset();
        }
        reset() {
            this.x = this.canvas.width / 2;
            this.y = this.canvas.height / 2;
            this.vx = (Math.random() - 0.5) * 0.8;
            this.vy = (Math.random() - 0.5) * 0.8;
            this.size = Math.random() * 3 + 1.5;
            this.hue = 180 + Math.random() * 80; // cyan-green range
            this.alpha = 0.6 + Math.random() * 0.4;
            this.life = 1;
        }
        update(intensity) {
            // Gentle centering force
            const dx = this.canvas.width / 2 - this.x;
            const dy = this.canvas.height / 2 - this.y;
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
        draw(ctx) {
            ctx.save();
            ctx.globalAlpha = this.alpha;
            ctx.fillStyle = `hsl(${this.hue}, 80%, ${60 + this.alpha * 40}%)`;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    const initParticles = () => {
        if (!canvasRef.current) return;
        const particles = [];
        const count = Math.min(280, Math.floor(window.innerWidth * window.innerHeight / 9000));
        for (let i = 0; i < count; i++) {
            particles.push(new Particle(canvasRef.current));
        }
        particlesRef.current = particles;
    };

    const runLoop = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const analyser = analyserRef.current;
        let dataArray = null;

        if (analyser) {
            dataArray = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(dataArray);
        }


        ctx.fillStyle = 'rgba(15,17,26,0.12)'; // light trails
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        let intensity = 0;

        if (dataArray) {
            // Simple voice intensity proxy (0–1)
            let sum = 0;
            for (let i = 0; i < dataArray.length; i += 4) sum += dataArray[i];
            const avg = sum / (dataArray.length / 4);
            intensity = Math.min(1, avg / 140); // tune sensitivity
        }

        particlesRef.current.forEach(p => {
            p.update(intensity);
            p.draw(ctx);
            // Respawn if too far or too quiet
            if (Math.hypot(p.x - canvas.width / 2, p.y - canvas.height / 2) > 900 ||
                (intensity < 0.03 && Math.random() < 0.008)) {
                p.reset();
            }
        });

        animationFrameRef.current = requestAnimationFrame(runLoop);
    };

    const setupAudio = async () => {
        if (audioCtxRef.current) return; // already setup

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;

        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        analyserRef.current = analyser;

        const audioEl = new Audio(understandingOtcMarketsSound);
        audioEl.crossOrigin = "anonymous";
        audioRef.current = audioEl;

        // Hook up finish event
        audioEl.addEventListener('ended', () => setIsPlaying(false));


        // Wait to create source until we want to play (or now is fine, need user gesture usually)
        // Just prepare logic
        const source = audioCtx.createMediaElementSource(audioEl);
        source.connect(analyser); // Route to analyser
        analyser.connect(audioCtx.destination); // Route to speakers

        sourceRef.current = source;
    };

    const handleTogglePlay = async () => {
        if (!audioCtxRef.current) {
            await setupAudio();
        }

        if (audioCtxRef.current.state === 'suspended') {
            await audioCtxRef.current.resume();
        }

        const audio = audioRef.current;
        if (!audio) return;


        if (isPlaying) {
            audio.pause();
            setIsPlaying(false);
        } else {
            audio.play().catch(e => console.error("Play failed", e));
            setIsPlaying(true);
        }
    };

    // Resize handler
    useEffect(() => {
        const handleResize = () => {
            if (canvasRef.current) {
                canvasRef.current.width = window.innerWidth;
                canvasRef.current.height = window.innerHeight;
                initParticles();
            }
        };

        window.addEventListener('resize', handleResize);
        handleResize(); // Init

        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Start Loop
    useEffect(() => {
        runLoop();
        return () => cancelAnimationFrame(animationFrameRef.current);
    }, []);

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: '#0f111a',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            flexDirection: 'column',
            overflow: 'hidden'
        }}>
            <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

            <div style={{ position: 'relative', zIndex: 10, textAlign: 'center', color: '#aaa', fontFamily: 'system-ui, sans-serif' }}>
                <h2 style={{ marginBottom: '0.5rem' }}>Voice Particle Cluster</h2>
                <p style={{ marginBottom: '1.5rem' }}>Playing: Understanding OTC Markets</p>
                <button
                    onClick={handleTogglePlay}
                    style={{
                        padding: '12px 24px',
                        fontSize: '1.1rem',
                        background: '#1e212a',
                        color: '#ddd',
                        border: '1px solid #444',
                        borderRadius: '8px',
                        cursor: 'pointer',
                    }}
                >
                    {isPlaying ? 'Pause Audio' : 'Play Audio'}
                </button>
            </div>

            <div style={{ position: 'absolute', bottom: 20, left: 20, zIndex: 10 }}>
                <a href="/" style={{ color: '#666', textDecoration: 'none' }}>← Back to Dashboard</a>
            </div>
        </div>
    );
};

export default VoiceParticlePage;
