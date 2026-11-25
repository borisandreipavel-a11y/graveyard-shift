# Build Journal

### 2026-11-25 20:10 EET — Kiro IDE, Steering
Kiro generated the three foundation steering files from the empty repo; they held guesses that contradicted the user's decisions (stack "TBD", a single src/) and were never committed in that form. Had to be redone.

### 2026-11-25 20:57 EET — Kiro IDE, Steering
Rewrote product.md, structure.md and tech.md from the user's decision list, locking in the five-package pnpm layout, the two postmortem scenarios, and the determinism rules; committed as `77ed008` at 21:07 and pushed to `origin/main`. Nothing went wrong.

### 2026-11-25 (this session) — Kiro IDE, Hooks
Created the `build-journal` hook (trigger: PostTaskExec, agent action) that appends one entry to this file after each spec task, then backfilled the two entries above from git history. One PowerShell quoting hiccup during setup, retried and resolved.
