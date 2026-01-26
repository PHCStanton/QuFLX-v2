# QuFLX — AI Speech (Voice Agent) Integration Plan
Date: 2026-01-22

## Goal
Add real-time voice capability to QuFLX’s Ask AI modal:
1) Voice input for asking questions (Speech → Text → existing Ask AI flow)
2) Optional real-time spoken responses (Speech → Speech, with transcript)

Also add an “Introduction” action at the top of the Ask AI modal header.

## Non-Goals
- No platform branding references outside QuFLX UI
- No client-side exposure of server API secrets
- No major UI redesign beyond the Ask AI modal enhancements

## Constraints & Principles
- Fail fast, fail loud: clear user-facing error states for mic permissions, disconnected sessions, invalid audio config
- Defensive error handling: explicit timeouts, bounded buffer sizes, strict message validation
- Minimal moving parts for v1: implement WebSocket relay first; WebRTC relay is optional

## External Voice API Summary (What We’re Integrating)
- Real-time bidirectional audio and text over WebSocket
- Endpoint: wss://api.x.ai/v1/realtime
- Session configuration supports:
  - voice personality selection (Ara/Rex/Sal/Eve/Leo)
  - instructions
  - audio input/output formats (PCM recommended)
- Authentication:
  - Server-side: API key can be used safely
  - Client-side: ephemeral token recommended

## Proposed Architecture (Phased)

### Phase 1 — Speech-to-Text for Ask AI (Recommended First Delivery)
Browser (AskAiModal)
  ↔ WebSocket
QuFLX Backend (Voice Relay)
  ↔ WebSocket
Voice Agent API

Outputs:
- Live transcript displayed in Ask AI modal
- “Use transcript” populates the Ask AI input field
- Existing /api/v1/ai/ask produces the answer (text)

Rationale:
- Avoids implementing streaming audio playback on day one
- Fits QuFLX’s current Ask AI model and keeps UX consistent

### Phase 2 — Full Duplex Voice (Speech-to-Speech + Transcript)
Add:
- Stream audio responses back to browser for playback
- Interruption handling (“barge-in”)
- Optional VAD-based hands-free mode

### Phase 3 — Optional WebRTC Transport
Use a relay similar to the cookbook example:
- Browser uses WebRTC for transport/latency benefits
- Server relays via WebSocket to the voice API
Tradeoff: more complexity (signaling/ICE/TURN config)

## Backend Design (Voice Relay)
Add a new QuFLX backend module/route group for voice:
- WebSocket endpoint: /api/v1/ai/voice/ws

Responsibilities:
- Authenticate to the voice API (server-side)
- Forward audio chunks upstream
- Forward transcript events downstream
- (Phase 2) Forward audio response chunks downstream

Security:
- Never send API keys to the browser
- Enforce strict size limits:
  - max audio chunk size
  - max buffered audio duration
  - max session duration without activity
- Rate limiting / connection caps (local dev defaults; configurable later)

Observability:
- Structured logs for:
  - session start/end
  - upstream connection errors
  - transcript event counts
- No sensitive payload logging

## Frontend Design (Ask AI Modal)
Add a “Voice” control cluster:
- Mic toggle: start/stop streaming audio
- Transcript area with partial/final state
- Button: “Use transcript” → inserts into prompt input
- Button: “Clear transcript”
- Status indicators:
  - Mic permission status
  - Connection status
  - Listening/Stopped

Add “Introduction” action in modal header:
- “Introduction (Text)” inserts QuFLX intro message into chat thread
- (Phase 2) “Introduction (Voice)” plays spoken intro

## Audio Format Recommendation
Default:
- input: audio/pcm (Linear16), 24000 Hz, mono
- output: audio/pcm (Linear16), 24000 Hz, mono

Why:
- Matches voice API defaults and quality expectations
- Good balance for trading: clear, low-latency speech

Fallback:
- 16000 Hz PCM if CPU/bandwidth is too high

Telephony-only scenario:
- G.711 μ-law (audio/pcmu) @ 8000 Hz
- G.711 A-law (audio/pcma) @ 8000 Hz

Chunking guidance:
- Send ~20ms frames
- Base64 encode audio bytes for transport

## Risk & Mitigations
- Browser audio conversion complexity:
  - Use a dedicated audio capture pipeline (AudioWorklet) and validate sample rate conversion
- Latency spikes:
  - Keep frames small, avoid large base64 batches
  - Backpressure handling (drop/queue policy)
- Permission and device failures:
  - Explicit UI states + retry
- Session runaway:
  - Idle timeout and maximum duration caps

## Acceptance Criteria (Phase 1)
- User can click mic, speak, see transcript appear in the Ask AI modal
- User can click “Use transcript” and submit to Ask AI (existing flow)
- No secrets exposed to client
- Clear errors shown for mic denied/disconnect
- Introduction option appears at top of modal and works

## Acceptance Criteria (Phase 2)
- User can hear spoken responses in real time
- Transcript remains visible and accurate
- Interruptions handled cleanly
 
 ## Settings & Customization
- **Voice Input Mode** (`voiceInputMode`):
  - `off`: Voice disabled.
  - `browser`: Uses **Web Speech API** for free, local, zero-latency dictation.
  - `server`: Uses **WebSocket Relay** for advanced AI audio streaming (Server-side).
- **Voice Read-Back**: Toggle for browser-based TTS.
- **Voice Customization**: Rate, Pitch, and Voice selection.

## Implementation Order & Status

- [x] 1) Add backend WebSocket voice relay endpoint (Verified)
- [x] 2) Add frontend mic capture + WS client + transcript UI
- [x] 3) Add Introduction header action
- [x] 4) Phase 1 validation (Browser TTS implemented)
- [~] 5) Phase 2 audio playback + interruptions (Infrastructure ready, using mock relay)
