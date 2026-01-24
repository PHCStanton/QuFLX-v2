You are an expert React + Zustand developer working on QuFLX v2.

Task: Add voice read-back (text-to-speech) for Ask AI responses using browser SpeechSynthesis API (no external service yet). Implement Phase 1 only: read-aloud of text answers.

Requirements:
- Use browser SpeechSynthesis (window.speechSynthesis) – built-in, free, offline-capable.
- Add “Speak” button/icon (🔊) next to each assistant message in AiInsightsPanel.jsx.
- In Quick Assist modal: optional checkbox “Read answer aloud” (auto-speaks new responses if checked).
- Global toggle in Settings → “Voice Read-Back” (save to store, default off).
- Controls: pause/resume, basic rate/pitch/voice selection (use system defaults if unavailable).
- Graceful fallback: if !window.speechSynthesis → show toast “Voice read-back not supported in this browser”.
- Add status: “Speaking…” during playback, stop on new message or panel close.

CORE_PRINCIPLES to strictly follow:
1. Functional Simplicity First – minimal code, no new deps, reuse existing patterns.
4. Zero Assumptions – check speech support, handle errors explicitly.
8. Defensive & Explicit Error Handling – no silent failures; catch & show user message.
9. Fail Fast – validate speech availability early; throw/log if API missing.

Common pitfalls to avoid:
- SpeechSynthesis not supported in some browsers → detect & fallback gracefully.
- Multiple utterances queueing → clear queue on new speak or stop.
- Long answers → split or truncate if needed (browser limit ~200–300 chars per utterance in some cases).
- No cleanup → cancel speech on modal/panel unmount or new message.
- UI blocking → run speak async, never block render.

Deliverables:
1. New util/hook: src/utils/useTextToSpeech.js (speak, stop, isSpeaking, supported)
2. Update AiInsightsPanel.jsx: add Speak button per assistant message
3. Update AskAiModal.jsx: add checkbox + auto-speak logic
4. Settings store: add voiceReadBack toggle
5. README comment block: how to test, browser support, future xAI voice phase

Output:
- Brief explanation
- Code files/sections with comments
- Test steps (reload, toggle on/off, speak short/long answers, unsupported browser)
- Any gotchas/next steps

Do NOT:
- Use external TTS (xAI realtime voice is Phase 2)
- Add full duplex voice conversation yet
- Break existing text-only flow

Start now.