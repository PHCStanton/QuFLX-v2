# Resume Prompt — Ask AI Performance Optimization (Phase A Execution)

**Author:** @Prompt-Engineer  ·  **Date:** 2026-04-18
**Purpose:** Minimal, high-signal prompt to resume work in a fresh session without re-investigation or wasted tokens.
**Target task:** Execute Phase A of the Ask AI Performance Optimization Plan.

---

## ✅ Refined Prompt (copy-paste this into the next session)

```markdown
@Team_Leader — Resume task: Phase A of Ask AI Performance Optimization.

CONTEXT (read FIRST, in parallel, do not re-investigate):
- Plan doc (authoritative): v2_Dev_Docs/AI_Model_Routing/Ask_AI_Performance_Optimization_Plan_26-04-18.md
- Agent memory: .agent-memory/activeContext.md and .agent-memory/progress.md
- Protocol: .clinerules/PHASE_REVIEW_PROTOCOL.md and .clinerules/agent-investigation-workflow.md

SCOPE: Execute ONLY Phase A (A.1 → A.9). Do NOT touch Phase B / C.
Phase A items (all already spec'd with before/after snippets in the plan):
- A.1 R-1   backend/services/ai/service.py        — reuse pooled client in probe()
- A.2 R-2   gui/.../AskAiModal.jsx                — defer contextInstructions memo (conversationMode gate)
- A.3 R-4   aiClient.js + useAskAi.js + Modal     — AbortController end-to-end
- A.4 R-5   gui/.../utils/aiContext.js            — uiMode-aware payload shrink (modal=5/10/5, insights=50/100/20)
- A.5 R-8   backend/utils/indicator_utils.py      — (asset, tf, mtime) TTL=5s cache
- A.6 R-9   backend/services/gateway/routes/ai.py — fix tail_count merge precedence
- A.7 R-10  aiClient.js + useAskAi.js             — structured error (err.code, err.retryable)
- A.8 R-11  backend/services/ai/service.py        — local probe fallback (/models → /health → root)
- A.9 R-12 + L-1/L-2/L-3 cleanup                  — loading-leak, dead lru_cache import, hoist Audio, sync selectedModel

DELEGATION:
- @Coder performs all physical edits.
- @Investigator verifies llama-server probe URLs before A.8 lands (read-only).
- @Reviewer MANDATORY phase-gate after Phase A complete — do NOT start Phase B.
- Use search_files/read_file in parallel for efficiency; no Brave Search needed (already done).

CONSTRAINTS:
- Core Principles #3 (incremental test), #8 (no silent failures), #9 (fail fast) — strict.
- Run `pytest backend/tests/test_ai_routing.py backend/tests/test_ai_service.py backend/tests/test_ai_routes.py` after backend changes.
- Update .agent-memory/activeContext.md + progress.md at end.
- Checklist boxes in the plan doc must flip [ ] → [x] or [~] as work progresses.

DELIVERABLE: Phase A code changes + passing tests + @Reviewer report, then STOP and await approval for Phase B.
```

---

## 📊 Original vs. Refined (comparison)

| Aspect | Original (typical verbose ask) | Refined (this prompt) |
|---|---|---|
| Context loading | "Investigate the Ask AI implementation…" → forces re-audit of 10+ files | Points to one authoritative plan doc + memory files — zero re-investigation |
| Scope fencing | Implicit / open-ended | Explicit A.1–A.9 list with file paths pre-mapped |
| Web research | User asks to "use Brave/context7" again → wasted tokens | Explicitly marked as "already done" |
| Delegation | Ambiguous | Coder/Investigator/Reviewer roles pinned to specific items |
| Protocol | Requires agent to re-derive rules | Inlined via single-line rule pointers |
| Testing | Forgotten or re-derived | Explicit pytest command + required files |
| Stopping condition | Vague ("report back") | Hard stop after Phase A + @Reviewer signoff |
| Token footprint | ~2–5 k tokens of re-exploration | **~300 tokens** input, ~0 exploration tokens |

---

## 🎯 Why It's Better

1. **Single source of truth** — the plan doc already contains every file path, before/after snippet, and verification checklist. The prompt's job is only to point there.
2. **Fencing prevents scope creep** — explicit "ONLY A.1–A.9" stops the agent from drifting into Phase B restructure work.
3. **Cache-friendly** — the prompt will fit in one short turn, leaving context headroom for the actual code edits.
4. **Self-policing** — by citing `PHASE_REVIEW_PROTOCOL.md` inline, the agent self-enforces the phase-gate without you needing to remind it.
5. **Failure-recoverable** — if the agent starts to re-audit, a one-line reminder "see the plan doc" is enough to refocus.
6. **Zero redundant research** — explicitly marks Brave Search/context7 as already consumed.

---

## Handoff

**From:** @Prompt-Engineer
**To:** @Team_Leader (next session)
**Usage:** Copy the fenced markdown block above into the next Cline task verbatim.
