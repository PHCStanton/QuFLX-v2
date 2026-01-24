# Dashboard

## Voice Dictation + Read-Back (TTS)

### Dictation

- **Ask AI Modal**: Use Voice to dictate a question, insert transcript, then ask.
- **AI Insights Panel**: Use Voice to dictate follow-ups inside the ongoing session.

### Voice Read-Back (Text-to-Speech)

- Enable **Settings → AI Assistant → Voice Read-Back**.
- Optional tuning:
  - **Voice Rate**, **Voice Pitch**, **Voice**
- **AI Insights Panel**: Each AI message has a **Speak** button; global **Pause/Resume/Stop** appears while speaking.
- **Ask AI Modal**: Enable **Read answer aloud** to auto-speak the next answer.

Notes:

- Uses the browser Web Speech API (`speechSynthesis`). Availability depends on browser/OS voices.
- If no voices are listed initially, they may populate after a short delay.
