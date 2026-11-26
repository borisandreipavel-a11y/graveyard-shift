// Unit tests for session creation (Task 6.2).
// Requirements: 3.1, 3.3

import { describe, it, expect } from 'vitest';
import { createSession } from '../session.js';
import { mkScenario } from './helpers.js';

const scenario = mkScenario();

describe('createSession', () => {
  it('returns an error when the participant list is empty (Requirement 3.1)', () => {
    const result = createSession(scenario, []);
    expect(result).toEqual({ error: 'no-participants' });
  });

  it('returns a session for a single participant with all initial fields correct (Requirement 3.3)', () => {
    const result = createSession(scenario, [{ id: 'player' }]);
    expect('error' in result).toBe(false);
    const session = result as Exclude<typeof result, { error: string }>;

    expect(session.clock).toBe(0);
    expect(session.outageStopped).toBe(false);
    expect(session.incidentFinished).toBe(false);
    expect(session.stoppedAt).toBeNull();
    expect(session.finishedAt).toBeNull();
    expect(session.actionLog).toEqual([]);
    expect(session.seenSignals).toEqual([]);
    expect(session.firedTimeTriggers).toEqual([]);
    expect(session.doneTargets).toEqual([]);
    expect(session.lookedTargets).toEqual([]);
    expect(session.pendingEffects).toEqual([]);
    expect(session.flags).toEqual({});
  });

  it('records the participant list in room.participants', () => {
    const result = createSession(scenario, [{ id: 'player' }]);
    const session = result as Exclude<typeof result, { error: string }>;
    expect(session.room.participants).toEqual([{ id: 'player' }]);
  });

  it('stores the scenario reference on the session', () => {
    const result = createSession(scenario, [{ id: 'player' }]);
    const session = result as Exclude<typeof result, { error: string }>;
    expect(session.scenario).toBe(scenario);
  });

  it('returns ok for multiple participants (Requirement 3.3)', () => {
    const result = createSession(scenario, [
      { id: 'alice' },
      { id: 'bob' },
    ]);
    expect('error' in result).toBe(false);
    const session = result as Exclude<typeof result, { error: string }>;
    expect(session.room.participants).toHaveLength(2);
    expect(session.room.participants[0]).toEqual({ id: 'alice' });
    expect(session.room.participants[1]).toEqual({ id: 'bob' });
  });

  it('does not share the participants array with the caller', () => {
    const participants = [{ id: 'player' }];
    const result = createSession(scenario, participants);
    const session = result as Exclude<typeof result, { error: string }>;
    participants.push({ id: 'intruder' });
    expect(session.room.participants).toHaveLength(1);
  });
});
