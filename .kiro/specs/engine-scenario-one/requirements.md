# Requirements Document

## Introduction

This spec covers the core of Graveyard Shift: the engine package, the scenario YAML schema, the first scenario file (Cloudflare 2 July 2019), a reusable command parser, and a minimal terminal runner. No web app, no MCP server, no LLM, and no infrastructure are in scope. The engine is a pure TypeScript package — it reads no files, prints nothing, reads no clock, and uses no randomness. All game rules live here; the terminal runner is a thin I/O shell that lives in its own package (`packages/runner`) outside the engine package, because the runner performs the file, stdin, and stdout I/O that the engine package must not perform.

## Glossary

- **Engine**: The pure TypeScript package (`packages/engine`) that holds all game rules as deterministic functions with no I/O. The Engine reads no files, reads no stdin, and prints nothing.
- **Scenario**: A YAML data file, one per outage, that describes signals, locations, actions, the real timeline, and finish conditions. Validated by a Zod schema.
- **Session**: A runtime value that records the full state of one play-through: participant list, action history, clock, and progress flags.
- **Room**: The session modelled as a shared space; every action records which participant took it. Only one participant is used now; the shape allows more.
- **Participant**: An actor in a room — a human player or an AI agent identified by a string ID.
- **Action**: A single player move, belonging to one of the fixed action kinds: `look`, `do`, `help`, or `wait`.
- **Target**: A string identifier defined in the scenario that names the subject of a `look` or `do` action.
- **Event**: A value returned by the engine describing what happened in response to an action (e.g., text revealed, signal received, flag changed).
- **Delayed_Effect**: An effect defined in the scenario that an action schedules to land a fixed number of minutes after the action was taken. The effect is applied when the `Incident_Clock` first reaches the action's clock time plus the delay.
- **Stopped_At**: The `Incident_Clock` value recorded on the session when `Outage_Stopped` was set.
- **Finished_At**: The `Incident_Clock` value recorded on the session when `Incident_Finished` was set.
- **Incident_Clock**: A counter, in whole minutes, that starts at 0 when the first page arrives and advances by the cost defined in the scenario for each action taken.
- **Outage_Stopped**: A boolean flag on the session, set when the scenario's stop condition is met (the outage has been halted but the incident is not yet finished).
- **Incident_Finished**: A boolean flag on the session, set when the scenario's finish condition is met (the incident is fully resolved).
- **Debrief**: A value produced at or after `Incident_Finished` that contains the player's action log with clock times, the real responders' timeline from the scenario, and the URL of the source postmortem.
- **Command_Parser**: A pure, exported function in the engine package that converts a typed text line into one `Action` value or a `NotUnderstood` result, without any I/O or game-state access.
- **Terminal_Runner**: A thin CLI program in its own package (`packages/runner`) outside the engine package. It handles all I/O: it reads the scenario YAML file from disk, parses the YAML text into a plain in-memory object, reads lines from stdin, calls the Command_Parser and Engine, and prints events. It contains no game rules.
- **YAML_Parser**: The file-reading and YAML-parsing step performed by the Terminal_Runner (or any other host) outside the engine package, converting a scenario file into a plain in-memory object. The engine package performs no file reading and no YAML parsing.
- **Loader**: The engine function that receives an already-parsed scenario object in memory, validates it against the Zod schema, and returns either a valid `Scenario` or a structured error. The Loader performs no file I/O and no YAML parsing; it only validates the object it is given.
- **Reachability_Check**: A graph traversal run by the Loader that verifies at least one sequence of actions from the initial state reaches `Incident_Finished`.
- **NotUnderstood**: The result returned by the Command_Parser when the typed line does not map to any action the scenario defines.
- **Blocked_Action**: An action the scenario permits in kind and target but whose preconditions are not yet satisfied.

---

## Requirements

### Requirement 1: Scenario Schema and Loader

**User Story:** As an engine developer, I want a typed Zod schema for scenario objects, so that invalid or malformed scenario data is caught before the game starts.

#### Acceptance Criteria

1. THE Loader SHALL accept a plain in-memory object (produced by the YAML_Parser outside the engine), validate it against the Zod schema, and return a typed `Scenario` value when every required field is present and well-formed.
2. WHEN the in-memory object is missing a required field, THE Loader SHALL return an error value that names the missing field by its schema path.
3. WHEN the in-memory object contains a field with an unexpected type, THE Loader SHALL return an error value that names the field path and states the expected type.
4. WHEN the in-memory object contains an action whose target is not listed in the scenario's defined targets, THE Loader SHALL return an error value that names the unresolved reference.
5. WHEN the in-memory object contains a time-triggered event whose minute is negative, THE Loader SHALL return an error value.
6. FOR ALL valid `Scenario` values, serialising then deserialising SHALL produce an equivalent `Scenario` value (round-trip property).

---

### Requirement 2: Reachability Check

**User Story:** As an engine developer, I want the Loader to reject scenarios with no path to completion, so that a player can never start a game that cannot be finished.

#### Acceptance Criteria

1. WHEN the Loader accepts a scenario, THE Reachability_Check SHALL confirm that at least one sequence of actions from the initial state reaches `Incident_Finished`.
2. WHEN no such sequence exists, THE Loader SHALL return an error value that states the scenario cannot be finished, and no `Session` shall be created.
3. FOR ALL scenarios that the Loader accepts, THE Engine SHALL guarantee that some sequence of actions from any reachable state that is not `Incident_Finished` leads to `Incident_Finished` (completability invariant).

---

### Requirement 3: Session State

**User Story:** As a player, I want the engine to hold my session state as a shared room, so that my progress is tracked and a future participant could join the same incident.

#### Acceptance Criteria

1. THE Engine SHALL create a new `Session` from a valid `Scenario` and an initial participant list containing at least one `Participant`.
2. THE Session SHALL record each action in a log that includes the action taken, the `Participant` who took it, and the `Incident_Clock` value at the time.
3. THE Session SHALL expose the current `Incident_Clock`, `Outage_Stopped`, `Incident_Finished`, `Stopped_At`, and `Finished_At` as readable fields; `Stopped_At` and `Finished_At` SHALL be `null` until the corresponding flag is set.
4. WHILE a `Session` exists, THE Engine SHALL treat the session as a shared room and accept actions from any participant in its participant list.
5. IF an action is submitted with a participant ID not in the session's participant list, THEN THE Engine SHALL return an error event and leave the session state unchanged.

---

### Requirement 4: Action Dispatch

**User Story:** As a player, I want to take actions one at a time and receive events describing what happened, so that I can investigate and resolve the incident.

#### Acceptance Criteria

1. THE Engine SHALL accept exactly four action kinds: `look`, `do`, `help`, and `wait`.
2. WHEN a `look` or `do` action names a target defined in the scenario, THE Engine SHALL process the action and return a non-empty list of events.
3. IF a `look` or `do` action names a target not defined in the scenario, THEN THE Engine SHALL return a `NotUnderstood` event and leave the session state unchanged.
4. WHEN a `help` action is taken, THE Engine SHALL return a list of events describing the actions currently available to the player.
5. WHEN a `wait` action is taken, THE Engine SHALL advance the `Incident_Clock` by the scenario-defined wait cost and return a list of events.
6. IF an action is submitted after `Incident_Finished` is set, THEN THE Engine SHALL return a finished event and leave the session state unchanged.
7. FOR ALL actions of any kind, THE Engine SHALL produce no I/O side effects, read no clock, and use no randomness.

---

### Requirement 5: Blocked Actions

**User Story:** As a player, I want the engine to tell me when an action is blocked and why, so that I know what I need to do first.

#### Acceptance Criteria

1. WHEN a player takes an action whose preconditions defined in the scenario are not yet satisfied, THE Engine SHALL return the scenario-defined blocked message and not apply the action's effects.
2. WHEN a blocked action is taken, THE Engine SHALL leave all session state flags unchanged.
3. WHEN a blocked action is taken and the scenario defines a clock cost for blocked attempts, THE Engine SHALL advance the `Incident_Clock` by that cost only.
4. FOR ALL blocked actions, the returned state SHALL differ from the pre-action state only in the `Incident_Clock` field, and only if the scenario defines a non-zero blocked cost.

---

### Requirement 6: Incident Clock, Time-Triggered Events, and Delayed Effects

**User Story:** As a player, I want the incident clock to advance with each action and trigger scenario events at the right times, so that the simulation feels like a real incident with time pressure.

#### Acceptance Criteria

1. THE Incident_Clock SHALL start at 0 when a new session is created and SHALL advance only by adding the scenario-defined cost of each action taken.
2. THE Engine SHALL never decrease the `Incident_Clock`.
3. WHEN the `Incident_Clock` reaches or passes a minute value at which the scenario defines a time-triggered event, THE Engine SHALL include that event in the response list for the action that caused the clock to reach that minute.
4. WHEN the `Incident_Clock` reaches or passes multiple time-triggered thresholds in a single action, THE Engine SHALL fire all of those events in ascending minute order.
5. THE Engine SHALL fire each time-triggered event exactly once per session, regardless of how many actions later pass its threshold minute.
6. WHEN an action with a scenario-defined `Delayed_Effect` is taken, THE Engine SHALL schedule that effect to land at the action's clock time plus the delay, without applying the effect's outcome at the moment the action is taken.
7. WHEN the `Incident_Clock` first reaches or passes a `Delayed_Effect`'s landing minute, THE Engine SHALL apply the effect's outcome and include its event in the response list for the action that caused the clock to reach that minute.
8. THE Engine SHALL apply each `Delayed_Effect` exactly once per session.
9. WHEN multiple `Delayed_Effect`s land on the same minute, THE Engine SHALL apply them in ascending original-action order.

---

### Requirement 7: Outage Stopped and Incident Finished

**User Story:** As a player, I want two distinct resolution moments — the outage stopped and the incident finished — so that the simulation reflects how real incidents close in stages.

#### Acceptance Criteria

1. WHEN the action defined by the scenario as the outage-stop trigger completes, THE Engine SHALL schedule the stop outcome as a `Delayed_Effect` with the scenario-defined delay (2 minutes for the global terminate of the WAF) and SHALL set `Outage_Stopped` to true when the recovery effect lands — that is, when the `Incident_Clock` first reaches the stop action's clock time plus the delay — not when the stop action is taken, and THE Engine SHALL include a stop event in the response list for the action that caused the clock to reach that minute.
2. WHEN the action defined by the scenario as the incident-finish trigger completes, THE Engine SHALL set `Incident_Finished` to true and include a finish event in the response list.
3. THE Engine SHALL require `Outage_Stopped` to be true before `Incident_Finished` can be set.
4. WHILE `Outage_Stopped` is false, THE Engine SHALL not set `Incident_Finished`.
5. WHEN `Outage_Stopped` is set, THE Engine SHALL record the current `Incident_Clock` value as `Stopped_At` on the session.
6. WHEN `Incident_Finished` is set, THE Engine SHALL record the current `Incident_Clock` value as `Finished_At` on the session.
7. THE `Outage_Stopped` and `Incident_Finished` flags SHALL never revert to false once set, and the `Stopped_At` and `Finished_At` values SHALL never change once recorded.

---

### Requirement 8: Debrief

**User Story:** As a player, I want a debrief at the end of the incident, so that I can compare my path with what the real responders did and learn from the postmortem.

#### Acceptance Criteria

1. WHEN `Incident_Finished` is set, THE Engine SHALL make a `Debrief` value available from the session.
2. THE Debrief SHALL contain the player's full action log: each action, the participant who took it, and the `Incident_Clock` value at the time.
3. THE Debrief SHALL contain the real responders' timeline as defined in the scenario, with each entry's UTC timestamp and description.
4. THE Debrief SHALL contain the URL of the source postmortem as defined in the scenario.
5. THE Debrief SHALL contain the scenario-defined language noting that the real response involved the resources described in the scenario (e.g., multiple teams), not just the player's single-participant session.
6. THE Debrief SHALL contain the `Stopped_At` clock value (the incident-clock minute at which `Outage_Stopped` was set) and the `Finished_At` clock value (the incident-clock minute at which `Incident_Finished` was set).
7. IF `Incident_Finished` is false, THEN THE Engine SHALL return an error when the debrief is requested.

---

### Requirement 9: Command Parser

**User Story:** As a web app or terminal runner developer, I want a pure parser function that converts typed text into an Action, so that input handling is consistent and reusable across both the terminal and the web app.

#### Acceptance Criteria

1. THE Command_Parser SHALL be a pure exported function with no I/O, no session access, and no side effects.
2. WHEN a typed line matches the pattern `<verb> <target>` and both the verb maps to a known action kind and the target is defined in the scenario, THE Command_Parser SHALL return the corresponding `Action` value.
3. WHEN a typed line is the word `help` alone, THE Command_Parser SHALL return a `help` action.
4. WHEN a typed line is the word `wait` alone, THE Command_Parser SHALL return a `wait` action.
5. WHEN a typed line does not match any pattern or names a target not defined in the scenario, THE Command_Parser SHALL return a `NotUnderstood` result containing the original input.
6. FOR ALL inputs, THE Command_Parser SHALL never return an action whose target is not in the given scenario's defined target list.
7. WHEN the same input string is given to THE Command_Parser more than once, THE Command_Parser SHALL return the same result each time (idempotence).

---

### Requirement 10: Terminal Runner

**User Story:** As a developer or tester, I want a minimal CLI that runs a scenario end to end, so that the engine can be exercised without a web browser.

#### Acceptance Criteria

1. THE Terminal_Runner SHALL live in its own package (`packages/runner`) outside the engine package, because the runner performs I/O (file reads, stdin, stdout) that the engine package must not perform.
2. THE Terminal_Runner SHALL accept a path to a scenario YAML file as a command-line argument, read the file, and parse the YAML text into a plain in-memory object (the YAML_Parser step) before passing that object to the Loader.
3. WHEN the YAML_Parser step fails (missing file or invalid YAML syntax), THE Terminal_Runner SHALL print the error message and exit with a non-zero code.
4. WHEN the Loader rejects the scenario object, THE Terminal_Runner SHALL print the error message and exit with a non-zero code.
5. WHILE `Incident_Finished` is false, THE Terminal_Runner SHALL read one line from stdin, pass it to the Command_Parser, pass the result to the Engine, and print each returned event as a line of text.
6. WHEN `Incident_Finished` is set, THE Terminal_Runner SHALL print the Debrief and exit with code 0.
7. THE Terminal_Runner SHALL contain no game rules: all action outcomes are determined by the Engine, and the engine package SHALL contain no file reading, no YAML parsing, and no stdin/stdout access.
8. WHEN the Command_Parser returns `NotUnderstood`, THE Terminal_Runner SHALL print a "not understood" message and prompt for the next line without advancing game state.

---

### Requirement 11: Determinism

**User Story:** As a test author and CI pipeline, I want identical inputs to always produce identical outputs, so that property-based tests and scenario playthroughs are repeatable and comparable.

#### Acceptance Criteria

1. FOR ALL valid scenarios and FOR ALL sequences of actions, applying the same sequence to a fresh session from the same scenario SHALL produce exactly the same sequence of states, events, and debrief.
2. THE Engine SHALL accept no sources of non-determinism: no `Date.now()`, no `Math.random()`, no file system access, and no network access.
3. FOR ALL valid actions, the `Incident_Clock` value in the returned state SHALL be greater than or equal to the `Incident_Clock` value before the action (monotone clock invariant).

---

### Requirement 12: Scenario One — Cloudflare 2 July 2019

**User Story:** As a player, I want to play through the Cloudflare 2 July 2019 outage, so that I can practise incident response on a real, documented event.

#### Acceptance Criteria

1. THE Scenario SHALL be a YAML file at `packages/scenarios/cloudflare-2019-07-02.yaml` that passes the Loader's schema validation.
2. THE Scenario SHALL define exactly one player participant and note in its debrief context that the real response involved multiple teams (marked as RECONSTRUCTION).
3. THE Scenario SHALL define the six signals that arrive in order, as described in the source postmortem; the source gives no arrival times for signals 2 to 6, so their arrival minutes SHALL be a reconstruction marked with `reconstruction: true` in the YAML.
4. THE Scenario SHALL define exactly five lookable targets — alert list, traffic level, CPU graph, internal control panel, and status page — each costing 1 minute of `Incident_Clock` time per read (a reconstruction of costs, marked `reconstruction: true` in the YAML).
5. THE Scenario SHALL define all doable targets with their minute costs, and no target ID or subject SHALL appear in both the look list and the do list. The do targets and costs are: declare P0 and escalate (2 min), pull live CPU data (3 min), run a process trace (3 min), read WAF error logs (3 min), check the change tickets (2 min, requires bypass first), treat it as an attack (8 min, dead end), try the control panel login (2 min, fails), use the bypass (3 min), global terminate of the WAF (1 min, with a `Delayed_Effect` recovery 2 minutes later; requires bypass first), follow the rollback plan (20 min), test the fix in one city (40 min), re-enable the WAF worldwide (5 min, requires one-city test first), update the status page (2 min). Live CPU data, process trace, WAF error logs, and change tickets are do targets only, with no look counterpart; investigating them is itself the `do` action. Reading an alert or a graph IS the `look` action on those targets, not a separate `do` action.
6. THE Scenario SHALL define that `global terminate of the WAF` sets `Outage_Stopped` via its `Delayed_Effect` — the flag is set when the recovery effect lands 2 minutes after the terminate action, not when the terminate action is taken — and that `re-enable the WAF worldwide` sets `Incident_Finished`.
7. THE Scenario SHALL include the real responders' timeline with UTC timestamps from the source postmortem: change merged 13:31, build passes 13:37, deployed everywhere 13:42, first page about 13:45 (derived from the source, marked `reconstruction: true`), WAF identified as cause 14:00, global terminate proposed 14:02, global terminate executed 14:07, traffic and CPU normal 14:09, WAF re-enabled 14:52. THE Scenario SHALL also include the durations stated or derived in the source: first page to cause identified about 15 minutes, first page to switch-off about 22 minutes, first page to recovery about 24 minutes, switch-off to WAF restored 45 minutes, and the source's stated outage duration of 27 minutes counted from the 13:42 deploy.
8. THE Scenario SHALL include the URL `https://blog.cloudflare.com/details-of-the-cloudflare-outage-on-july-2-2019` as the source postmortem link.
9. THE Scenario SHALL contain no executable code, no expressions, and no logic; all data SHALL be static values.
10. ALL entries that are not directly stated in the source postmortem SHALL be marked with `reconstruction: true` in the YAML.
