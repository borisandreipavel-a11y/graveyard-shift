// Public API of the pure engine. Exports grow as tasks are completed.
export const engineVersion = '0.0.1';

// Task 4: Loader and Reachability
export { loadScenario } from './loader.js';
export { reachabilityCheck } from './reachability.js';

// Task 6: Session creation
export { createSession } from './session.js';

// Task 7: Clock
export { advanceClock } from './clock.js';

// Task 8: Action dispatch
export { applyAction } from './dispatch.js';

// Types (re-exported for consumers)
export type {
  Scenario,
  Action,
  ActionKind,
  Participant,
  Signal,
  LookTarget,
  DoTarget,
  DelayedEffectSpec,
  RealTimelineEntry,
  Session,
  ActionLogEntry,
  PendingEffect,
  Event,
  Debrief,
  ParsedCommand,
  LoadResult,
  LoadError,
  SchemaIssue,
} from './types.js';
