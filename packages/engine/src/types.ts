// Core type definitions for the pure engine.
// The engine performs no I/O of any kind: these are plain data shapes.
//
// Scenario is defined once in schema.ts (inferred from the Zod schema) and
// re-exported here so the rest of the engine imports from a single location.
export type { Scenario } from './schema.js';

// --- Actions ---

/** The closed set of action kinds (Requirement 4.1). */
export type ActionKind = 'look' | 'do' | 'help' | 'wait';

export type Action =
  | { kind: 'look'; target: string }
  | { kind: 'do'; target: string }
  | { kind: 'help' }
  | { kind: 'wait' };

// --- Participants ---

/** An actor in the shared room: a human player or an AI agent (Requirement 3.1). */
export type Participant = { id: string };

// --- Scenario data ---

export type Signal = {
  id: string;
  text: string;
  /** undefined means present from clock 0 */
  arrivesAtMinute?: number;
  /** true when the arrival minute is not stated in the source postmortem */
  reconstruction?: boolean;
};

export type LookTarget = {
  id: string;
  /** e.g. 'the alert list' */
  name: string;
  /** revealed text, first look */
  description: string;
  /** optional, later looks */
  descriptionOnRepeat?: string;
  /** minutes of Incident_Clock */
  cost: 1;
  reconstruction?: boolean;
};

export type DelayedEffectSpec = {
  /** 2 for the WAF recovery */
  delayMinutes: number;
  /** event text when it lands */
  text: string;
  /** which session flag it sets on landing */
  setsFlag: 'outage_stopped';
};

export type DoTarget = {
  id: string;
  name: string;
  /** outcome text on success */
  description: string;
  /**
   * Optional message shown to the player when this action is blocked by
   * unmet preconditions. When absent, dispatch falls back to a generic
   * message that does not expose internal target ids.
   */
  blockedMessage?: string;
  /** minutes of Incident_Clock (Requirement 12.5) */
  cost: number;
  /** ids of do-targets that must be done first */
  requires?: string[];
  outcome:
    | { kind: 'reveals'; text: string }
    | { kind: 'dead-end'; text: string }
    | { kind: 'fails'; text: string }
    | { kind: 'delayed'; effect: DelayedEffectSpec }
    | { kind: 'progress'; flag: string }
    | { kind: 'finish' };
  reconstruction?: boolean;
};

export type RealTimelineEntry = {
  /** e.g. '13:31' */
  utcTimestamp: string;
  description: string;
  reconstruction?: boolean;
};

// --- Session ---

export type ActionLogEntry = {
  action: Action;
  participantId: string;
  /** Incident_Clock value before the action was applied */
  clockAtAction: number;
};

export type PendingEffect = {
  landsAtMinute: number;
  /** do-target id of the action that scheduled this effect */
  sourceActionId: string;
  /** original-action order (Requirement 6.9) */
  sequence: number;
  effect: DelayedEffectSpec;
};

export type Session = {
  scenario: Scenario;
  room: {
    /** shared-room model (Requirement 3) */
    participants: Participant[];
  };
  /** Incident_Clock, whole minutes, starts at 0 */
  clock: number;
  outageStopped: boolean;
  incidentFinished: boolean;
  stoppedAt: number | null;
  finishedAt: number | null;
  actionLog: ActionLogEntry[];
  /** signal ids already delivered */
  seenSignals: string[];
  /** time-triggered signal ids, once each (Requirement 6.5) */
  firedTimeTriggers: string[];
  /** completed do-target ids (for `requires`) */
  doneTargets: string[];
  /** for repeat descriptions */
  lookedTargets: string[];
  /** delayed effects not yet landed */
  pendingEffects: PendingEffect[];
  /** generic progress flags */
  flags: Record<string, boolean>;
};

// --- Events ---

export type Event =
  | { kind: 'text'; text: string }
  | { kind: 'signal'; signalId: string; text: string }
  | { kind: 'blocked'; message: string }
  | { kind: 'not-understood'; input: string }
  | { kind: 'error'; message: string }
  | { kind: 'stop'; text: string; clock: number }
  | { kind: 'finish'; text: string; clock: number }
  | { kind: 'finished-already' }
  | { kind: 'help'; lines: string[] };

// --- Debrief ---

export type Debrief = {
  /** Requirement 8.2 */
  actionLog: ActionLogEntry[];
  /** Requirement 8.3: UTC timestamp + description */
  realTimeline: RealTimelineEntry[];
  /** Requirement 8.4 */
  sourceUrl: string;
  /** Requirement 8.5 */
  reconstructionNote: string;
  /** Requirement 8.6 */
  stoppedAt: number;
  finishedAt: number;
  /** durations stated/derived in the source */
  sourceDurations: Scenario['sourceDurations'];
};

// --- Command parser ---

export type ParsedCommand =
  | { ok: true; action: Action }
  | { ok: false; reason: 'not-understood'; input: string };

// --- Load results ---

export type SchemaIssue = {
  /** e.g. "targets.do[3].cost" */
  path: string;
  /** zod issue code, e.g. 'invalid_type' */
  code: string;
  /** e.g. 'string' */
  expected?: string;
  message: string;
};

export type LoadError =
  /** from Zod (Requirements 1.2, 1.3) */
  | { kind: 'schema'; issues: SchemaIssue[] }
  /** no sequence of actions reaches Incident_Finished (Requirement 2.2) */
  | { kind: 'unreachable' }
  /** unresolved target reference (Requirement 1.4) */
  | { kind: 'reference'; path: string; message: string };

export type LoadResult =
  | { ok: true; scenario: Scenario }
  | { ok: false; error: LoadError };
