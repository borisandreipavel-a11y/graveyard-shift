// Session creation for the pure engine.
// Creates the initial Session value from a validated Scenario and participant list.
// Pure function; no I/O of any kind.

import type { Scenario, Participant, Session } from './types.js';

/**
 * Create a new Session from a valid Scenario and at least one Participant.
 *
 * Returns `{ error: 'no-participants' }` if the participant list is empty
 * (Requirement 3.1).
 *
 * All mutable arrays are fresh; callers may not share them.
 */
export function createSession(
  scenario: Scenario,
  participants: Participant[],
): Session | { error: 'no-participants' } {
  if (participants.length === 0) {
    return { error: 'no-participants' };
  }

  return {
    scenario,
    room: {
      participants: [...participants],
    },
    clock: 0,
    outageStopped: false,
    incidentFinished: false,
    stoppedAt: null,
    finishedAt: null,
    actionLog: [],
    seenSignals: [],
    firedTimeTriggers: [],
    doneTargets: [],
    lookedTargets: [],
    pendingEffects: [],
    flags: {},
  };
}
