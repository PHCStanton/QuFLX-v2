# CORE PRINCIPLES  
*Non-negotiable rules that override all other instructions. Every agent must follow these at all times.*

### 1. Functional Simplicity First
- Ruthlessly eliminate unnecessary complexity.
- Choose the simplest solution that fully satisfies requirements.
- If two approaches work, always pick the one with fewer moving parts.

### 2. Sequential Logic (MCP-style thinking)
- Reason explicitly step-by-step.
- Each new step must build directly and clearly on the previous one.
- Never skip or combine steps without written justification.

### 3. Incremental Testing After Every Change
- Test immediately after adding or modifying code.
- Never proceed until the current change passes all relevant tests.

### 4. Zero Assumptions
- Verify everything explicitly.
- If anything is unclear → ask one concise clarifying question instead of guessing.

### 5. Code Integrity & Backward Compatibility
- Never introduce breaking changes without explicit user approval.
- Existing functionality must continue working perfectly.

### 6. Strict Separation of Concerns
- One file / class / function = one clear responsibility.
- Clear, enforceable boundaries between layers and modules.

### 7. **The “Stop Patching, Start Rewriting” Rule** (CRITICAL)
> **Infinite fixing is forbidden.**

When an agent (especially Coder or Debugger) encounters a problem area, it MUST pause and evaluate:

| Situation                                           | Required Action                                                                                  |
|-----------------------------------------------------|--------------------------------------------------------------------------------------------------|
| More than 2–3 incremental fixes attempted           | → Stop. Do not make another patch.                                                               |
| Code is becoming tangled, duplicated, or unstable   | → Propose a clean rewrite of the file/module/component instead of another fix.                  |
| Technical debt is visibly accumulating              | → Explicitly recommend full replacement or major refactoring before proceeding.                |
| The same bug keeps resurfacing                      | → This is a symptom of bad structure → rewrite is mandatory.                                    |
| Fix would exceed ~30–40 lines or touch >3 unrelated concerns | → Treat as a red flag → suggest rewrite or redesign.                                            |

**Mandated phrasing when this rule triggers (copy-paste this):**
> “Further patching will increase complexity and risk. I strongly recommend a clean rewrite of [file/module] instead of another incremental fix. This will be faster, safer, and more maintainable long-term. Shall I prepare the rewritten version?”

**Never** let the AI spiral into endless small fixes that confuse or frustrate non-expert users. Protecting user time and sanity is more important than preserving every line of existing code.

### Enforcement
- Team Leader must enforce Rule 7 on every specialist.
- Any agent that violates these principles must be corrected immediately.
- When in doubt, favor simplicity, clarity, and user mental health over “saving” messy code.

### 8. Defensive & Explicit Error Handling (Zero Silent Failures)
- **Never swallow errors** — no empty catch blocks, no `console.log(err)`, no `try/catch` that silently continues.
- Every error must be either:
  - Handled meaningfully and gracefully (user-friendly message + safe recovery), or
  - Propagated upward so a higher layer can decide.
- In UI code: always show a clear, non-technical toast/alert instead of letting the app freeze or show raw stack traces.
- In backend/API code: always return proper HTTP status codes + structured JSON error responses.
- Required phrasing when you spot a violation:
  > “This catch block swallows the error and will cause silent failures in production. Must either log + re-throw, return a proper error response, or show a user-friendly message.”

### 9. Fail Fast, Fail Loud, Fail Predictably
- Validate inputs at the earliest possible point (zod, pydantic, TypeScript types, runtime checks).
- Throw meaningful errors during development if invariants are broken.
- Never use optional chaining (`?.`) or nullish coalescing (`??`) as a band-aid for missing validation.
- In React: never let a component render half-broken state — use error boundaries or loading skeletons.
- In async code: always handle promise rejections (no unhandled rejections).
- Required phrasing when this is violated:
  > “This code can reach an impossible state because input is not validated early. We must add validation/schema checks here to fail fast and prevent downstream crashes.”

*Last updated: November 30, 2025*