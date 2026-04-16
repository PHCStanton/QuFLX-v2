The detailed implementation plan __`AI_Backend_Indicator_Awareness_Fix_Plan_26-04-14.md`__ has been compiled and saved to `ai_dev_docs/`.

The plan documents the full forensic investigation findings and provides a 6-phase implementation roadmap to stabilize the AI backend indicator awareness feature:

1. __Root Cause Identified:__ `_inject_backend_indicators()` in `ai.py` still uses the old subprocess-based architecture (spawning `runner.py` → `indicator_calculator.py`) that was replaced by OPT-1 in the indicator route — this is why the feature keeps regressing.

2. __Fix Strategy:__ Rewrite the injection function to use the same in-process `TechnicalIndicatorsPipeline` (via `asyncio.to_thread()`) that the indicator route already uses successfully. Change the logic from "all-or-nothing" to "always supplement" so the AI always gets a complete indicator set regardless of frontend toggle state. Frontend snapshots take precedence via simple dict merge (`{**backend, **existing}`).

3. __Enable/Disable:__ Simple `skipBackendIndicators: true` context flag — default ON, no UI complexity needed.

4. __6 Phases:__ Shared utility extraction → AI route rewrite → Indicator route refactor → Dead code cleanup → Test coverage (7 test cases) → End-to-end verification.

The plan is ready for your review and approval before implementation begins.
