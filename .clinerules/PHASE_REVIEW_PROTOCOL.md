**Global Rule: Incremental Phase Review & Delegation Protocol**  
**For All Development & Implementation Plans in QuFLX-v2**  
**File:** `.agents/PHASE_REVIEW_PROTOCOL.md`  
**Version:** 1.0 (Effective immediately)

This is a **mandatory workspace rule** that every Coding Agent, Team Leader, and delegated specialist **must follow** for any multi-phase Implementation Plan.

### Core Principle
No phase may proceed to the next until it has been **incrementally reviewed, tested (where applicable), and explicitly approved**.  
This enforces **CORE_PRINCIPLES #3 (Incremental Testing)**, **#8 (Zero Silent Failures)**, and **#9 (Fail Fast, Fail Loud)**.

### Phase Completion Flow (Strict Sequence)

**After every Phase completion:**

1. **@Team_Leader** must immediately delegate **@Reviewer** with the exact message:  
   `"Phase X completed. Perform full incremental review."`

2. **@Reviewer** must:
   - Conduct a **systematic line-by-line review** of all changed files.
   - Verify alignment with CORE_PRINCIPLES.md and the original plan.
   - Run **unit tests** (or integration tests) if the phase touches logic, data flow, or calculations.
   - Check for regressions against previous phases.
   - Produce a short, structured report containing:
     - Status (✅ Passed / ⚠️ Minor issues / 🔴 Blocking issues)
     - Any findings with severity
     - Confirmation that changes are optimal and ready
     - Suggested fixes (if any)

3. **@Reviewer** must reply with the report and end with:  
   `"Review complete. Awaiting explicit command to proceed."`

4. **No agent** (including @Team_Leader or @Coder) may continue to the next phase or make any further changes until the user issues an **explicit command** such as:
   - “Proceed with next phase”
   - “Approved – continue”
   - “Next Phase”
   - “Implementation Plan approved – continue”

### End-of-Plan Final Validation

**When the entire Implementation Plan is marked complete** by @Coder:

1. **@Team_Leader** must delegate **all four specialists** in one message:  
   `"Full Implementation Plan complete. Perform final multi-agent review."`

2. The following agents must each respond in order:
   - **@Reviewer** — overall correctness & alignment
   - **@Debugger** — runtime behavior, edge cases, silent failures
   - **@Optimizer** — performance, efficiency, unnecessary complexity
   - **@Code_Simplifier** — functional simplicity, duplication, readability

3. Each specialist must provide a short verdict (✅ / ⚠️ / 🔴) with one-sentence justification.

4. **@Team_Leader** must compile the four verdicts into a final summary and await user approval before closing the plan.

### Enforcement Rules
- Any deviation from this flow (skipping review, proceeding without explicit user command, or continuing after a 🔴 report) violates the protocol and must be self-corrected immediately.
- This rule applies to **every** future Implementation Plan, feature addition, or bug-fix sprint in QuFLX-v2 and OTC SNIPER in web_app directory.
- Agents must reference this rule by name in their delegation and review messages for traceability.