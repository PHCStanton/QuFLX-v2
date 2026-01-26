You are a senior React + Zustand + Tailwind engineer working on QuFLX v2 — a real-time OTC binary options trading dashboard for Pocket Option.

Task: Complete the Voice Agent & TTS implementation with a new Custom System Instructions setting.

Must implement:
1. Browser TTS (Phase 1) – read-back of text answers using SpeechSynthesis API
   - Global toggle: Settings → AI Assistant → “Voice Read-Back” (default off, persist in store/localStorage)
   - Voice selector dropdown: list available voices, auto-select most natural neural (e.g. “Neural”, “Jenny”, “Libby”, “Aria”)
   - Sliders: rate (0.8–1.2), pitch (0.8–1.2)
   - “Speak” button (🔊) next to each assistant message in AiInsightsPanel.jsx
   - Quick Assist modal: checkbox “Read answer aloud” (auto-speaks new responses if checked)
   - Status: “Speaking…” during playback, cancel on new message/close
   - Fallback toast: “Voice read-back not supported in this browser”

2. Voice Agent (Phase 2) – dictation + optional full conversation
   - Keep existing useVoiceAgent hook (mic → transcript → text prompt)
   - Add toggle in Settings → AI Assistant → “Voice Mode: Dictation only” vs “Full Conversation” (default Dictation)
   - Dictation: text-only responses
   - Conversation: modalities ['text', 'audio'] → Grok voice reply + playback
   - Status line: idle / connecting / ready / recording / speaking

3. Custom System Instructions field
   - Settings → AI Assistant → large textarea “Custom Instructions” + Save button
   - Persist in store/localStorage
   - Prepend or override default system prompt in backend service.py
   - Example use: “Always use ONLY QuFLX live OTC data. Never external sources. Focus on Pocket Option OTC, payout ≥92%.”

4. Enforce OTC data lock
   - Backend system prompt (service.py): “You MUST use ONLY QuFLX-provided TradingContext (live ticks, candles, indicators). DO NOT search web, use external sources (Deriv, etc.), or recall cached prices. If data insufficient, say so.”
   - Apply to all modes (text, dictation, conversation)

CORE_PRINCIPLES.md (must obey every rule):
1. Functional Simplicity First — minimal code, no new deps
4. Zero Assumptions — detect TTS/WS support early
5. Code Integrity — no breaking text-only flow
6. Strict Separation of Concerns — one hook per feature
8. Defensive Error Handling — no silent failures; user toasts
9. Fail Fast — validate early, throw/log if API missing

Additional quality rules:
- React: useEffect for voice loading, cleanup on unmount
- Accessibility: respect prefers-reduced-motion (disable auto-speak)
- Performance: queue utterances, no render blocking
- Clean code: TypeScript types, JSDoc, meaningful names
- Pitfalls to avoid: voices not loaded (onvoiceschanged), utterance queue overflow, no cleanup, long text cutoff, browser quirks

Deliverables:
1. src/hooks/useTextToSpeech.ts – TTS hook (speak, stop, isSpeaking, voices, settings)
2. src/hooks/useVoiceAgent.ts – update for conversation toggle
3. Settings UI patch: toggles, voice selector, sliders, custom instructions textarea
4. AiInsightsPanel.jsx: Speak button + playback status
5. AskAiModal.jsx: voice controls + auto-speak checkbox
6. Backend service.py patch: custom instructions injection + OTC data lock prompt
7. Test instructions (Chrome/Edge): toggle, speak, voice mode switch, custom prompt
8. Gotchas/next steps (e.g. xAI realtime stability)

Do NOT:
- Add new deps
- Break existing text flow
- Expose API keys client-side

Output:
- Brief explanation (max 100 words)
- Code blocks/files with comments
- Test steps
- Warnings/next steps

Start now — produce clean, production-ready code.