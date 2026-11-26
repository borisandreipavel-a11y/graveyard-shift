# Build Journal

### 2026-11-25 20:10 EET â€” Kiro IDE, Steering
Kiro generated the three foundation steering files from the empty repo; they held guesses that contradicted the user's decisions (stack "TBD", a single src/) and were never committed in that form. Had to be redone.

### 2026-11-25 20:57 EET â€” Kiro IDE, Steering
Rewrote product.md, structure.md and tech.md from the user's decision list, locking in the five-package pnpm layout, the two postmortem scenarios, and the determinism rules; committed as `77ed008` at 21:07 and pushed to `origin/main`. Nothing went wrong.

### 2026-11-25 (this session) â€” Kiro IDE, Hooks
Created the `build-journal` hook (trigger: PostTaskExec, agent action) that appends one entry to this file after each spec task, then backfilled the two entries above from git history. One PowerShell quoting hiccup during setup, retried and resolved.

### 2026-11-26 10:20 EET — Kiro IDE, Spec / Tasks
engine-scenario-one task 16.1: asked to create fast-check arbitraries (participantArb, lookTargetArb, doTargetArb, alidScenarioArb, ctionArb, ctionSequenceArb) in packages/engine/src/__tests__/arbitraries.ts. Created using structural construction so alidScenarioArb always passes loadScenario without filtering; all 128 existing tests continue to pass.

### 2026-11-26 10:28 EET — Kiro IDE, Spec / Tasks
Spec: engine-scenario-one, task 16.9. Asked to write property test P8 (session flag monotone invariants) validating Req 7.3–7.7. Test was written and passed; fast-check found a real engine bug where a stop target taken twice could overwrite stoppedAt — fixed in clock.ts with an idempotency guard, and the related clock unit test was updated.
