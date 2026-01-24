You are a senior React + Zustand + Tailwind engineer working on QuFLX v2 — a real-time OTC binary options trading dashboard.

Task: Add browser-based text-to-speech (TTS) read-back for Ask AI answers using the native SpeechSynthesis API (window.speechSynthesis).  
Implement Phase 1 only: natural-sounding read-aloud of text responses (no external services yet).

Requirements (must implement all):
- Global toggle in Settings → “Voice Read-Back” (default: off, persist via Zustand + localStorage)
- Voice selector dropdown: list all available voices, pre-select the most natural-sounding neural/human-like voice (e.g. names containing “Neural”, “Premium”, “Online”, “Jenny”, “Libby”, “Aria”)
- Sliders for rate (0.8–1.2, default 1.0) and pitch (0.8–1.2, default 1.0)
- “Speak” button (🔊 icon) next to every assistant message in AiInsightsPanel.jsx — reads that message aloud using current settings
- In Quick Assist modal: checkbox “Read answer aloud” — if checked, auto-speaks new assistant responses
- Status feedback: “Speaking…” during playback, cancel on new message, modal/panel close, or user click
- Graceful degradation: if !window.speechSynthesis or no voices → show toast “Voice read-back not supported in this browser” (once per session)
- Interrupt current speech when new speak request arrives or user clicks stop

CORE_PRINCIPLES.md (must obey every rule — no exceptions):
1. Functional Simplicity First — minimal code, no new dependencies, reuse existing patterns
4. Zero Assumptions — detect speech support early, validate voices loaded
5. Code Integrity — no breaking changes to existing text flow
6. Strict Separation of Concerns — one hook for TTS logic
8. Defensive & Explicit Error Handling — no silent failures; catch & notify user
9. Fail Fast — throw/log early if API missing or voices not loaded

Additional quality principles to follow:
- React best practices: use useEffect for voice loading (async voices list), cleanup on unmount
- Accessibility: respect prefers-reduced-motion (disable auto-speak if enabled)
- Performance: queue utterances properly, never block render thread
- Testing mindset: add comments explaining how to manually test each feature
- Error resilience: handle utterance boundary events, voice change during playback
- Clean code: TypeScript types for voice settings, JSDoc comments, meaningful variable names

Common pitfalls to avoid (explicitly check before finishing):
- Voices not loaded on first render (especially iOS/Chrome) → wait for onvoiceschanged event
- Multiple utterances queuing endlessly → clear queue on new speak or stop
- Long text → split into chunks if browser cuts off (> ~200–300 chars per utterance)
- No cleanup → cancel() on component unmount or new message
- Browser-specific quirks → test in Chrome + Edge (most reliable); warn on Safari/Firefox if needed

Deliverables (structured output):
1. New file: src/hooks/useTextToSpeech.ts (or .js) — full hook with speak, stop, isSpeaking, supported, voices, setVoice, setRate, setPitch
2. Settings store update (marketStore.js or settings slice): add voiceEnabled, selectedVoice, rate, pitch
3. Settings UI snippet: toggle + voice dropdown + sliders
4. AiInsightsPanel.jsx patch: add Speak button per assistant message
5. AskAiModal.jsx patch: add auto-speak checkbox + logic
6. Brief test instructions (reload, toggle, speak short/long, unsupported browser)
7. Any gotchas or next steps (e.g. Phase 2 xAI realtime TTS)

Do NOT:
- Use external TTS services (xAI realtime voice is Phase 2)
- Add full duplex conversation
- Break existing text-only Ask AI flow
- Introduce new dependencies

Output format:
- Brief explanation (max 100 words)
- Code blocks/files with comments
- Test steps
- Any warnings/next steps

Start now — produce clean, production-ready code.