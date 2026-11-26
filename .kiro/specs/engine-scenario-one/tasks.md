# Implementation Plan: engine-scenario-one

## Overview

Build three packages in dependency order: `packages/engine` (pure TypeScript game engine — types, schema, loader, reachability, session, dispatch, clock, debrief, parser), `packages/scenarios` (Cloudflare 2019 YAML file), and `packages/runner` (terminal CLI). The engine has no I/O of any kind; all I/O lives in the runner. Property-based tests use fast-check; unit tests use Vitest.

## Tasks

- [x] 1. Initialise the pnpm workspace and package scaffolding
  - Create `pnpm-workspace.yaml` at the repo root listing `packages/*`
  - Create `packages/engine/package.json` (name `@graveyard-shift/engine`, `"type": "module"`, strict TypeScript, zod as dependency, vitest + fast-check as dev dependencies)
  - Create `packages/scenarios/package.json` (name `@graveyard-shift/scenarios`, data-only, no runtime deps)
  - Create `packages/runner/package.json` (name `@graveyard-shift/runner`, depends on `@graveyard-shift/engine`, yaml as dependency)
  - Create root `tsconfig.base.json` (strict, `moduleResolution: bundler`, `target: ES2022`) and per-package `tsconfig.json` files extending it
  - Create `packages/engine/vitest.config.ts`
  - _Requirements: 10.1_

- [x] 2. Add ESLint purity guardrail for the engine package
  - Install ESLint and configure a root `.eslintrc` (or `eslint.config.js`) for the workspace
  - Add `no-restricted-globals` rule banning `Date` and `Math.random` in `packages/engine/**`
  - Add `no-restricted-imports` rule banning `fs`, `node:fs`, and any `node:*` import in `packages/engine/**`
  - Wire the lint step into `packages/engine/package.json` scripts so it runs before tests
  - Confirm the rule fires: add a minimal negative test (a file importing `fs` inside engine should produce a lint error)
  - _Requirements: 10.1_

- [x] 3. Define core TypeScript types and the Zod schema
  - [x] 3.1 Write all type definitions in `packages/engine/src/types.ts`
    - Define `ActionKind`, `Action`, `Participant`, `Signal`, `LookTarget`, `DoTarget`, `DelayedEffectSpec`, `RealTimelineEntry`, `Scenario`, `Session`, `ActionLogEntry`, `PendingEffect`, `Event`, `Debrief`, `ParsedCommand`, `LoadResult`, `LoadError`, `SchemaIssue` exactly as specified in the design's Data Models section
    - _Requirements: 1.1, 3.1, 3.2, 3.3, 4.1, 6.1, 7.5, 7.6, 8.1_

  - [x] 3.2 Write the Zod schema in `packages/engine/src/schema.ts`
    - Implement `SignalSchema`, `LookTargetSchema`, `DoTargetSchema` (with the `outcome` discriminated union covering all six outcome kinds), `RealTimelineEntrySchema`, `ScenarioSchema`
    - Use `z.number().int().min(0)` for all minute fields (rejects negatives per Requirement 1.5)
    - Export `ScenarioSchema` and re-export `Scenario` as `z.infer<typeof ScenarioSchema>`
    - _Requirements: 1.1, 1.2, 1.3, 1.5_

  - [x]* 3.3 Write unit tests for the Zod schema in `packages/engine/src/__tests__/schema.test.ts`
    - Test each required field missing → error; wrong type per field → error; negative minute → error; valid minimal object → ok
    - _Requirements: 1.2, 1.3, 1.5_

- [ ] 4. Implement the Loader and Reachability Check
  - [ ] 4.1 Implement the Loader in `packages/engine/src/loader.ts`
    - Export `loadScenario(obj: unknown): LoadResult`
    - Run `ScenarioSchema.safeParse(obj)`, map Zod issues to `SchemaIssue[]` (path via `issue.path.join('.')`, expected type from `issue.expected` or derived from `code`/`message`)
    - Run cross-reference checks after schema passes: every `DoTarget.requires` id exists in `targets.do`; `stop.triggerAction` exists in `targets.do`; `finish.triggerAction` exists in `targets.do`; signal ids unique; no id appears in both look and do lists
    - Return `{ ok: false, error: { kind: 'reference', path, message } }` for each unresolved reference
    - Call `reachabilityCheck(scenario)` and return `{ ok: false, error: { kind: 'unreachable' } }` if it fails
    - Return `{ ok: true, scenario }` on success
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2_

  - [ ] 4.2 Implement the Reachability Check in `packages/engine/src/reachability.ts`
    - Export `reachabilityCheck(scenario: Scenario): boolean`
    - BFS over done-sets (each state = `Set<string>` of completed do-target ids); edges = every do-target whose `requires ⊆ doneSet` plus `wait` (clock-only, no state change needed here); visited set keyed by sorted done-set string
    - Accept iff a state is reached where `finish.triggerAction` is in the done-set AND the stop trigger is transitively reachable before it (stop trigger must be in done-set before finish trigger is reachable, enforced by the `requires` chain)
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ]* 4.3 Write unit tests for the Loader in `packages/engine/src/__tests__/loader.test.ts`
    - Missing required field → error naming path; wrong type → error naming path and expected type; negative trigger minute → error; unresolved `requires` id → reference error; unresolved `stop.triggerAction` → reference error; duplicate signal id → error; valid scenario → ok
    - _Requirements: 1.2, 1.3, 1.4, 1.5_

  - [ ]* 4.4 Write unit tests for the Reachability Check in `packages/engine/src/__tests__/reachability.test.ts`
    - Simple linear chain (look → do → finish) → reachable; dead-end only graph → unreachable; isolated dead-end branch + valid path → reachable; scenario with no finish trigger at all → unreachable
    - _Requirements: 2.1, 2.2, 2.3_

- [ ] 5. Checkpoint — schema, loader, and reachability
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implement Session creation
  - [ ] 6.1 Implement `createSession` in `packages/engine/src/session.ts`
    - Export `createSession(scenario: Scenario, participants: Participant[]): Session | { error: 'no-participants' }`
    - Return `{ error: 'no-participants' }` when the array is empty (Requirement 3.1)
    - Initial `Session`: `clock: 0`, `outageStopped: false`, `incidentFinished: false`, `stoppedAt: null`, `finishedAt: null`, `actionLog: []`, `seenSignals: []`, `firedTimeTriggers: []`, `doneTargets: []`, `lookedTargets: []`, `pendingEffects: []`, `flags: {}`
    - _Requirements: 3.1, 3.2, 3.3, 6.1_

  - [ ]* 6.2 Write unit tests for session creation in `packages/engine/src/__tests__/session.test.ts`
    - Empty participant list → error; single participant → ok, all initial fields correct; multiple participants → ok
    - _Requirements: 3.1, 3.3_

- [ ] 7. Implement the clock and delayed-effect resolution
  - [ ] 7.1 Implement clock advancement in `packages/engine/src/clock.ts`
    - Export `advanceClock(session: Session, minutes: number): { session: Session; events: Event[] }`
    - After advancing `clock += minutes`, fire time-triggered signals (arrivesAtMinute ≤ newClock, not in `firedTimeTriggers`) in ascending minute order — emit `{ kind: 'signal', signalId, text }` events and add to `firedTimeTriggers`
    - Fire landed pending effects (landsAtMinute ≤ newClock) sorted by `(landsAtMinute, sequence)` — apply each exactly once, remove from `pendingEffects`
    - For `setsFlag: 'outage_stopped'`: set `outageStopped: true`, `stoppedAt: effect.landsAtMinute`, emit `{ kind: 'stop', text: effect.text, clock: effect.landsAtMinute }`
    - Return new immutable session and accumulated events
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 7.1, 7.5_

  - [ ]* 7.2 Write unit tests for clock and effects in `packages/engine/src/__tests__/clock.test.ts`
    - Advance by 0 → clock unchanged, no events; advance past single time-trigger → signal event; advance past multiple triggers in one step → events in ascending minute order; each trigger fires only once across multiple advances; delayed effect does not fire at action time, fires when clock reaches landing minute; two effects same landing minute → applied in sequence order
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.7, 6.8, 6.9_

- [ ] 8. Implement action dispatch
  - [ ] 8.1 Implement `applyAction` in `packages/engine/src/dispatch.ts`
    - Export `applyAction(session: Session, action: Action): { session: Session; events: Event[] }`
    - Follow the dispatch flowchart from the design exactly:
      1. Unknown participant → `{ kind: 'error' }` event, session unchanged
      2. `incidentFinished` → `{ kind: 'finished-already' }` event, session unchanged
      3. `help` action → list available do and look targets in `{ kind: 'help', lines }` event; cost 0, no clock advance
      4. `wait` action → call `advanceClock(session, scenario.costs.wait)`; return new session + events
      5. `look` or `do` with unknown target → `{ kind: 'not-understood', input: target }` event, session unchanged
      6. `do` with unmet `requires` → `{ kind: 'blocked', message }` event; advance clock by `costs.blocked` only; no flag changes
      7. `look` action on valid target → reveal description (or `descriptionOnRepeat` if in `lookedTargets`); add to `lookedTargets`; advance clock by `target.cost` via `advanceClock`
      8. `do` action on valid target → apply outcome (reveals text, dead-end text, fails text, schedule delayed effect into `pendingEffects`, set progress flag, set `incidentFinished` if `kind: 'finish'` and `outageStopped`); advance clock via `advanceClock`; add to `doneTargets`; append to `actionLog`
    - For `kind: 'finish'` outcome: if `outageStopped` is false, return `{ kind: 'blocked', message }` event and advance clock only by `costs.blocked` — the finish action is guarded by the same blocked mechanic as an unmet `requires` (Requirement 7.4). Only when `outageStopped` is true: set `incidentFinished: true`, `finishedAt: newClock`, emit `{ kind: 'finish', text, clock: newClock }`
    - For `kind: 'delayed'` outcome: push `PendingEffect { landsAtMinute: clockBeforeAction + action.cost + effect.delayMinutes, sequence: pendingEffects.length, effect }` before calling `advanceClock`
    - Append action to `actionLog` with `clockAtAction` = clock value before the action
    - Return new immutable session (use object spread / structural copy throughout)
    - _Requirements: 3.2, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.2, 5.3, 5.4, 6.6, 7.2, 7.3, 7.4_

  - [ ]* 8.2 Write unit tests for dispatch in `packages/engine/src/__tests__/dispatch.test.ts`
    - `help` → lists targets, clock unchanged; `wait` → clock advances by wait cost; `look` known target → description returned, clock advances, target added to lookedTargets; `look` same target again → repeat description used; `do` with met preconditions → outcome applied, doneTargets updated; `do` with unmet preconditions → blocked event, only blocked cost paid, flags unchanged; `do` dead-end → event returned, no flags set; `do` delayed → pending effect scheduled, no immediate flag; `do` finish before outageStopped is true → blocked event (not not-understood); action after finish → `finished-already`; unknown participant → error event, session unchanged
    - _Requirements: 3.2, 4.1–4.6, 5.1–5.4, 7.2, 7.3, 7.4_

- [ ] 9. Checkpoint — session, clock, and dispatch
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Implement the Debrief
  - [ ] 10.1 Implement `getDebrief` in `packages/engine/src/debrief.ts`
    - Export `getDebrief(session: Session): Debrief | { error: 'not-finished' }`
    - Return `{ error: 'not-finished' }` when `session.incidentFinished` is false
    - Otherwise return `Debrief { actionLog, realTimeline, sourceUrl: scenario.source.url, reconstructionNote: scenario.reconstructionNote, stoppedAt: session.stoppedAt!, finishedAt: session.finishedAt!, sourceDurations: scenario.sourceDurations }` — `sourceDurations` carries all five values (pageToIdentified, pageToSwitchOff, pageToRecovery, switchOffToWafRestored, outageFromDeploy) from the scenario
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [ ]* 10.2 Write unit tests for debrief in `packages/engine/src/__tests__/debrief.test.ts`
    - Request debrief on unfinished session → error; request debrief after full playthrough → all Debrief fields populated correctly; actionLog matches what was submitted; sourceUrl and reconstructionNote match scenario; stoppedAt and finishedAt are correct clock values; sourceDurations in the debrief matches the scenario's sourceDurations exactly
    - _Requirements: 8.1–8.7_

- [ ] 11. Implement the Command Parser
  - [ ] 11.1 Implement `parseCommand` in `packages/engine/src/parser.ts`
    - Export `parseCommand(line: string, scenario: Scenario): ParsedCommand`
    - Trim; empty → `not-understood`
    - Exact `help` → `help` action; exact `wait` → `wait` action
    - Split on first whitespace: verb + rest; verb aliases: `look`/`examine`/`read` → `look`; `do`/`use`/`go`/`try` → `do`
    - Strip leading particles from rest: `at the`, `at`, `the` before matching
    - Match rest case-insensitively against target names and ids (hyphens/spaces interchangeable); `look` verb resolves only against `targets.look`; `do` verb only against `targets.do`
    - Bare do-target fallback: if no verb match, try full trimmed line against `targets.do` names and ids (lower priority, do-targets only)
    - No match → `{ ok: false, reason: 'not-understood', input: line }`
    - Function is pure: no state, no I/O
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [ ]* 11.2 Write unit tests for the command parser in `packages/engine/src/__tests__/parser.test.ts`
    - `help` → help action; `wait` → wait action; `look alert-list` → look action; `examine the alert list` → look action (alias + particle strip); `do use-bypass` → do action; `use the bypass` → do action (alias + particle); bare do-target name → do action; unknown target → not-understood with original input; empty string → not-understood; look verb against do-target → not-understood; same input twice → identical result
    - _Requirements: 9.2–9.7_

- [ ] 12. Wire the engine public API
  - Create `packages/engine/src/index.ts` exporting `loadScenario`, `createSession`, `applyAction`, `getDebrief`, `parseCommand`, and all public types (`LoadResult`, `LoadError`, `SchemaIssue`, `Scenario`, `Session`, `Participant`, `Action`, `ActionKind`, `Event`, `Debrief`, `ParsedCommand`)
  - _Requirements: 1.1, 4.1, 8.1, 9.1_

- [ ] 13. Write the Cloudflare 2019 scenario YAML file
  - [ ] 13.1 Create `packages/scenarios/cloudflare-2019-07-02.yaml` with the content specified in the design's "Scenario YAML shape" section
    - `id: cloudflare-2019-07-02`, `title`, `source.url`, `source.title`, `reconstructionNote`
    - Six signals per Requirement 12.3: `sig-page` arrives at minute 0 (no reconstruction marker); signals 2–6 have `reconstruction: true` and their arrival minutes
    - Five look targets (`alert-list`, `traffic-level`, `cpu-graph`, `control-panel`, `status-page`), each `cost: 1`, with descriptive text written in plain original language derived from the facts in requirements.md and design.md — not quoted from the postmortem; the facts (timeline, costs, signals, targets) come from the postmortem, but every description sentence is the author's own phrasing
    - Thirteen do targets with ids, names, costs, `requires`, and `outcome` kinds exactly as specified in Requirement 12.5 and the design's YAML shape; `description` fields written in plain original language (same phrasing rule as look targets); `reconstruction: true` where applicable
    - `stop.triggerAction: global-terminate-waf`, `finish.triggerAction: re-enable-waf`
    - `costs: { wait: 1, blocked: 1 }`, `costsAreEstimates: true`
    - `sourceDurations` with the five values from Requirement 12.7
    - `realTimeline` with the nine entries from Requirement 12.7 (13:31, 13:37, 13:42, 13:45 with `reconstruction: true`, 14:00, 14:02, 14:07, 14:09, 14:52)
    - Static data only: no executable code, no expressions, no logic
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9, 12.10_

  - [ ]* 13.2 Write integration tests for the scenario file in `packages/runner/src/__tests__/cloudflare.test.ts`
    - This test lives in the runner package because reading and parsing YAML is the runner's responsibility; the test reads the YAML file via the runner's HostIO/YAML step (using the `yaml` package), passes the resulting plain object to `loadScenario` from the engine, and asserts the result
    - Load the YAML file → ok; exactly 5 look targets; exactly 13 do targets; `stop.triggerAction` exists in do-targets; `finish.triggerAction` exists in do-targets; no id appears in both look and do lists; `source.url` matches the postmortem URL; signals 2–6 have `reconstruction: true`; `realTimeline` has 9 entries; `costsAreEstimates` is true
    - _Requirements: 12.1–12.10_

- [ ] 14. Checkpoint — scenario file and engine integration
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 15. Implement the Terminal Runner
  - [ ] 15.1 Define the `HostIO` interface and implement real and fake adapters in `packages/runner/src/hostio.ts`
    - Interface: `{ readFile(path: string): string; readLine(): Promise<string>; writeLine(text: string): void }`
    - `RealHostIO` using `fs.readFileSync`, `readline` over `process.stdin/stdout`, and `console.log`
    - `FakeHostIO` for tests: accepts pre-canned input lines, collects output lines
    - _Requirements: 10.1, 10.7_

  - [ ] 15.2 Implement the CLI in `packages/runner/src/cli.ts`
    - Accept scenario YAML path as `process.argv[2]`; validate argument present
    - Read file via `HostIO.readFile`; parse YAML text to plain object using the `yaml` npm package; on YAML parse failure print error and exit 1 (Requirement 10.3)
    - Call `loadScenario`; on failure print each error detail and exit 1 (Requirement 10.4)
    - Call `createSession` with `[{ id: 'player' }]`; deliver `initialSignals` as opening text
    - REPL loop: read line → `parseCommand` → if `not-understood` print message and re-prompt without calling engine; else `applyAction` → print each event; loop until `incidentFinished`
    - On finish: call `getDebrief`, print debrief (action log with clock times, real timeline, source URL, reconstruction note, stopped-at and finished-at values, and all five sourceDurations values), exit 0
    - _Requirements: 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_

  - [ ]* 15.3 Write unit tests for the runner in `packages/runner/src/__tests__/cli.test.ts`
    - Missing file path → error message; invalid YAML → error + exit 1; invalid scenario (bad schema) → error + exit 1; happy-path playthrough using `FakeHostIO` with minimal action sequence → runs to debrief, exit 0; `not-understood` command → prints message, does not advance state; action after finish → `finished-already` message
    - _Requirements: 10.2–10.8_

- [ ] 16. Write property-based tests for the engine
  - [ ] 16.1 Create fast-check arbitraries in `packages/engine/src/__tests__/arbitraries.ts`
    - `participantArb`, `lookTargetArb`, `doTargetArb`, `validScenarioArb` (always produces a scenario that passes `loadScenario`), `actionArb(scenario)`, `actionSequenceArb(scenario, maxLen)`
    - _Requirements: 11.1, 11.2_

  - [ ] 16.2 Write property test P1 (round-trip) in `packages/engine/src/__tests__/loader.property.test.ts`
    - **Property 1: Scenario serialisation round-trip**
    - **Validates: Requirements 1.6**

  - [ ] 16.3 Write property test P2 (schema error naming) in `packages/engine/src/__tests__/loader.property.test.ts`
    - **Property 2: Schema error names the offending field path and expected type**
    - **Validates: Requirements 1.2, 1.3, 1.4**

  - [ ] 16.4 Write property test P3 (reachability iff completable) in `packages/engine/src/__tests__/reachability.property.test.ts`
    - **Property 3: Reachability acceptance iff completable**
    - **Validates: Requirements 2.1, 2.2, 2.3**

  - [ ] 16.5 Write property test P4 (blocked changes only clock) in `packages/engine/src/__tests__/dispatch.property.test.ts`
    - **Property 4: Blocked action changes only the Incident_Clock**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

  - [ ] 16.6 Write property test P5 (monotone clock) in `packages/engine/src/__tests__/clock.property.test.ts`
    - **Property 5: Monotone clock invariant**
    - **Validates: Requirements 6.1, 6.2, 11.3**

  - [ ] 16.7 Write property test P6 (time triggers exactly once) in `packages/engine/src/__tests__/clock.property.test.ts`
    - **Property 6: Time-triggered events fire exactly once per session, in ascending minute order**
    - **Validates: Requirements 6.3, 6.4, 6.5**

  - [ ] 16.8 Write property test P7 (delayed effects timing) in `packages/engine/src/__tests__/clock.property.test.ts`
    - **Property 7: Delayed effects are not applied at action time and are applied exactly once at their landing minute**
    - **Validates: Requirements 6.6, 6.7, 6.8, 7.1**

  - [ ] 16.9 Write property test P8 (flag monotone invariants) in `packages/engine/src/__tests__/session.property.test.ts`
    - **Property 8: Session flag monotone invariants**
    - **Validates: Requirements 7.3, 7.4, 7.5, 7.6, 7.7**

  - [ ] 16.10 Write property test P9 (debrief iff finished) in `packages/engine/src/__tests__/debrief.property.test.ts`
    - **Property 9: Debrief is available if and only if Incident_Finished is set**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7**

  - [ ] 16.11 Write property test P10 (parser target safety + idempotence) in `packages/engine/src/__tests__/parser.property.test.ts`
    - **Property 10: Command parser target safety and idempotence**
    - **Validates: Requirements 9.6, 9.7**

  - [ ] 16.12 Write property test P11 (determinism) in `packages/engine/src/__tests__/determinism.property.test.ts`
    - **Property 11: Determinism — same inputs produce same outputs**
    - **Validates: Requirements 11.1, 11.2**

- [ ] 17. Final checkpoint — full test suite
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Unit-test sub-tasks marked with `*` are optional and can be skipped for a faster MVP; core engine behaviour is still covered by the required implementation tasks
- All property-based test tasks (16.2–16.12, P1–P11) are **required** — they verify universal correctness properties and are not marked optional
- Each task references specific requirements for traceability
- `applyAction` returns a new session object on every call — no mutation anywhere in the engine package
- The `HostIO` injection in the runner allows the full REPL to be unit-tested without touching `fs` or `process.stdin`
- Property tests use `fc.assert(fc.property(...))` with each property tagged by number and requirement clause in a comment directly above the call
- The scenario YAML file is the authoritative data source; its content must match the postmortem facts exactly, with every reconstruction explicitly marked; all descriptions are written in plain original language — not quoted from the postmortem

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2"] },
    { "id": 2, "tasks": ["3.1", "3.2"] },
    { "id": 3, "tasks": ["3.3", "4.1", "4.2"] },
    { "id": 4, "tasks": ["4.3", "4.4"] },
    { "id": 5, "tasks": ["5"] },
    { "id": 6, "tasks": ["6.1"] },
    { "id": 7, "tasks": ["6.2", "7.1"] },
    { "id": 8, "tasks": ["7.2", "8.1"] },
    { "id": 9, "tasks": ["8.2"] },
    { "id": 10, "tasks": ["9"] },
    { "id": 11, "tasks": ["10.1"] },
    { "id": 12, "tasks": ["10.2", "11.1"] },
    { "id": 13, "tasks": ["11.2", "12"] },
    { "id": 14, "tasks": ["13.1"] },
    { "id": 15, "tasks": ["13.2", "14"] },
    { "id": 16, "tasks": ["15.1"] },
    { "id": 17, "tasks": ["15.2"] },
    { "id": 18, "tasks": ["15.3", "16.1"] },
    { "id": 19, "tasks": ["16.2", "16.3", "16.4", "16.5", "16.6", "16.7", "16.8", "16.9", "16.10", "16.11", "16.12"] },
    { "id": 20, "tasks": ["17"] }
  ]
}
```
