## Brief overview
Rules for how Cline should conduct forensic investigation and implementation tasks using the @Investigator and @Reviewer agent patterns in the QuFLX-v2 project. Covers read-only analysis, mandatory phase-gate reviews, report format, plan document output, and delegation conventions.

## Investigation phase (read-only)
- When asked to "delegate the Investigator" or perform forensic analysis, operate in strict read-only mode — never suggest, generate, or apply code changes during the investigation phase
- Always read `.agent-memory/` files at the start of any investigation to load project context before touching source files
- Use parallel file reads wherever possible to minimize round-trips
- Cite exact file paths and line numbers for every finding — never paraphrase without evidence
- If something is unclear, state "Need clarification" rather than guessing
- Investigation output must follow this mandatory structure:
  1. **Summary** (1–2 sentences)
  2. **Critical Issues** — severity-rated: CRITICAL / HIGH / MEDIUM / LOW
  3. **Detailed Findings** — file + line + exact quote + explanation + why it matters
  4. **Recommendations** — what must be fixed and which specialist (@Coder, @Architect, etc.)
  5. **Risk Forecast** — what breaks next if ignored

## Phase-gate review rule (MANDATORY)
- After every completed implementation Phase, **delegate @Reviewer** before proceeding to the next Phase
- The @Reviewer must check: readability, security (OWASP), maintainability, separation of concerns, fail-fast validation, and explicit error handling
- If @Reviewer finds a violation of Core Principle #8 (silent failures) or #9 (fail fast), use the required verbatim phrasing from `CORE_PRINCIPLES.md`
- @Reviewer never implements fixes — only reports findings and mentions @Coder for remediation
- Do not mark a Phase as `[x]` complete in the plan document until @Reviewer has signed off on it
- Use `[~]` to indicate a Phase that is implemented but pending @Reviewer sign-off

## Plan document conventions
- All implementation plans must be saved as Markdown files in `v2_Dev_Docs/` under a relevant subfolder
- Filename format: `{Topic}_Plan_{YY-MM-DD}.md` (e.g. `Asset_Normalization_Truth_Source_Plan_26-03-21.md`)
- Use `[x]` for completed items, `[~]` for in-progress / pending review, `[ ]` for not started
- Every plan must include: Executive Summary, Architecture context, Current State Map (table), Implementation Phases with code snippets, Verification Checklist, Files Touched Summary, and Risk Assessment table
- Plans are produced by @Investigator and handed to @Coder — never skip the handoff

## Agent delegation conventions
- @Investigator → forensic read-only analysis, root cause finding, plan authoring
- @Reviewer → phase-gate quality check after each completed Phase (mandatory)
- @Coder → all physical code writing and edits
- @Architect → cross-cutting structural decisions (e.g. new normalization contexts, API contracts)
- @Debugger → only after @Investigator has delivered findings
- Never have @Coder and @Investigator active simultaneously on the same file

