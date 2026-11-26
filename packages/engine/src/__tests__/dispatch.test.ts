// Unit tests for action dispatch (Task 8.2).
// Requirements: 3.2, 4.1–4.6, 5.1–5.4, 7.2, 7.3, 7.4

import { describe, it, expect } from 'vitest';
import { applyAction } from '../dispatch.js';
import { createSession } from '../session.js';
import { mkScenario, doTarget, lookTarget, signal } from './helpers.js';
import type { Session } from '../types.js';

function session(overrides?: Parameters<typeof mkScenario>[0]): Session {
  const scenario = mkScenario(overrides);
  return createSession(scenario, [{ id: 'player' }]) as Session;
}

// ---------------------------------------------------------------------------
// help
// ---------------------------------------------------------------------------

describe('help action', () => {
  it('returns a help event with available targets', () => {
    const s = session();
    const { session: s1, events } = applyAction(s, { kind: 'help' });
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('help');
    // Session state must not change.
    expect(s1.clock).toBe(0);
    expect(s1.actionLog).toHaveLength(0);
  });

  it('help event lists both look and do targets', () => {
    const s = session();
    const { events } = applyAction(s, { kind: 'help' });
    const helpEvent = events[0] as Extract<typeof events[number], { kind: 'help' }>;
    const joined = helpEvent.lines.join('\n');
    expect(joined).toContain('dashboard'); // look target from helpers
    expect(joined).toContain('terminate'); // do target from helpers
  });

  it('clock does not advance on help', () => {
    const s = session();
    const { session: s1 } = applyAction(s, { kind: 'help' });
    expect(s1.clock).toBe(s.clock);
  });
});

// ---------------------------------------------------------------------------
// wait
// ---------------------------------------------------------------------------

describe('wait action', () => {
  it('advances clock by the scenario wait cost', () => {
    const s = session();
    const { session: s1 } = applyAction(s, { kind: 'wait' });
    expect(s1.clock).toBe(s.scenario.costs.wait);
  });

  it('records a wait log entry', () => {
    const s = session();
    const { session: s1 } = applyAction(s, { kind: 'wait' });
    expect(s1.actionLog).toHaveLength(1);
    expect(s1.actionLog[0].action).toEqual({ kind: 'wait' });
    expect(s1.actionLog[0].clockAtAction).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// look
// ---------------------------------------------------------------------------

describe('look action', () => {
  it('returns description text and advances clock by target cost', () => {
    const s = session();
    const { session: s1, events } = applyAction(s, { kind: 'look', target: 'dashboard' });
    expect(events[0]).toEqual({ kind: 'text', text: 'All red.' });
    expect(s1.clock).toBe(1);
  });

  it('adds target to lookedTargets', () => {
    const s = session();
    const { session: s1 } = applyAction(s, { kind: 'look', target: 'dashboard' });
    expect(s1.lookedTargets).toContain('dashboard');
  });

  it('records a look log entry with correct clockAtAction', () => {
    const s = session();
    const { session: s1 } = applyAction(s, { kind: 'look', target: 'dashboard' });
    expect(s1.actionLog[0].action).toEqual({ kind: 'look', target: 'dashboard' });
    expect(s1.actionLog[0].clockAtAction).toBe(0);
  });

  it('uses descriptionOnRepeat for the same target the second time', () => {
    const look = lookTarget({
      id: 'dashboard',
      description: 'All red.',
      descriptionOnRepeat: 'Still all red.',
    });
    const s = session({ look: [look] });
    const first = applyAction(s, { kind: 'look', target: 'dashboard' });
    const second = applyAction(first.session, { kind: 'look', target: 'dashboard' });
    expect((second.events[0] as { text: string }).text).toBe('Still all red.');
  });

  it('uses base description when descriptionOnRepeat is absent', () => {
    const s = session();
    const first = applyAction(s, { kind: 'look', target: 'dashboard' });
    const second = applyAction(first.session, { kind: 'look', target: 'dashboard' });
    expect((second.events[0] as { text: string }).text).toBe('All red.');
  });

  it('returns not-understood for an unknown look target', () => {
    const s = session();
    const { session: s1, events } = applyAction(s, { kind: 'look', target: 'unknown' });
    expect(events[0]).toEqual({ kind: 'not-understood', input: 'unknown' });
    expect(s1.clock).toBe(0); // session unchanged
  });
});

// ---------------------------------------------------------------------------
// do — progress
// ---------------------------------------------------------------------------

describe('do action — progress outcome', () => {
  it('applies progress flag and adds to doneTargets', () => {
    // 'terminate' has a delayed outcome in default helpers — use a simple progress one.
    const s = session({
      do: [
        doTarget({ id: 'declare-p0', outcome: { kind: 'progress', flag: 'p0-declared' } }),
        doTarget({ id: 'terminate', outcome: { kind: 'delayed', effect: { delayMinutes: 1, text: 'Stop.', setsFlag: 'outage_stopped' } } }),
        doTarget({ id: 're-enable', requires: ['terminate'], outcome: { kind: 'finish' } }),
      ],
    });
    const { session: s1 } = applyAction(s, { kind: 'do', target: 'declare-p0' });
    expect(s1.flags['p0-declared']).toBe(true);
    expect(s1.doneTargets).toContain('declare-p0');
  });

  it('advances clock by the target cost', () => {
    const s = session({
      do: [
        doTarget({ id: 'quick', cost: 2, outcome: { kind: 'progress', flag: 'done' } }),
        doTarget({ id: 'terminate', outcome: { kind: 'delayed', effect: { delayMinutes: 1, text: 'Stop.', setsFlag: 'outage_stopped' } } }),
        doTarget({ id: 're-enable', requires: ['terminate'], outcome: { kind: 'finish' } }),
      ],
    });
    const { session: s1 } = applyAction(s, { kind: 'do', target: 'quick' });
    expect(s1.clock).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// do — blocked
// ---------------------------------------------------------------------------

describe('do action — blocked', () => {
  it('returns a blocked event and only advances clock by blocked cost (Requirements 5.1–5.4)', () => {
    const s = session();
    // 're-enable' requires 'terminate' which is not done yet.
    const { session: s1, events } = applyAction(s, { kind: 'do', target: 're-enable' });
    expect(events[0].kind).toBe('blocked');
    expect(s1.clock).toBe(s.scenario.costs.blocked);
    expect(s1.doneTargets).not.toContain('re-enable');
    expect(s1.flags).toEqual({});
  });

  it('blocked action does not change flags (Requirement 5.2)', () => {
    const s = session();
    const { session: s1 } = applyAction(s, { kind: 'do', target: 're-enable' });
    expect(s1.flags).toEqual(s.flags);
  });

  it('blocked action differs from pre-action only in clock (Requirement 5.4)', () => {
    const s = session();
    const { session: s1 } = applyAction(s, { kind: 'do', target: 're-enable' });
    // Compare all fields except clock and actionLog (which both legitimately changed).
    expect(s1.flags).toEqual(s.flags);
    expect(s1.doneTargets).toEqual(s.doneTargets);
    expect(s1.lookedTargets).toEqual(s.lookedTargets);
    expect(s1.pendingEffects).toEqual(s.pendingEffects);
    expect(s1.outageStopped).toEqual(s.outageStopped);
    expect(s1.incidentFinished).toEqual(s.incidentFinished);
  });
});

// ---------------------------------------------------------------------------
// do — dead-end
// ---------------------------------------------------------------------------

describe('do action — dead-end outcome', () => {
  it('returns dead-end text and no flags set', () => {
    const s = session({
      do: [
        doTarget({ id: 'dead-action', outcome: { kind: 'dead-end', text: 'No luck.' } }),
        doTarget({ id: 'terminate', outcome: { kind: 'delayed', effect: { delayMinutes: 1, text: 'Stop.', setsFlag: 'outage_stopped' } } }),
        doTarget({ id: 're-enable', requires: ['terminate'], outcome: { kind: 'finish' } }),
      ],
    });
    const { session: s1, events } = applyAction(s, { kind: 'do', target: 'dead-action' });
    expect((events[0] as { text: string }).text).toBe('No luck.');
    expect(s1.flags).toEqual({});
    expect(s1.incidentFinished).toBe(false);
  });

  it('adds a dead-end target to doneTargets', () => {
    const s = session({
      do: [
        doTarget({ id: 'dead-action', outcome: { kind: 'dead-end', text: 'No luck.' } }),
        doTarget({ id: 'terminate', outcome: { kind: 'delayed', effect: { delayMinutes: 1, text: 'Stop.', setsFlag: 'outage_stopped' } } }),
        doTarget({ id: 're-enable', requires: ['terminate'], outcome: { kind: 'finish' } }),
      ],
    });
    const { session: s1 } = applyAction(s, { kind: 'do', target: 'dead-action' });
    expect(s1.doneTargets).toContain('dead-action');
  });
});

// ---------------------------------------------------------------------------
// do — delayed (stop trigger)
// ---------------------------------------------------------------------------

describe('do action — delayed outcome', () => {
  it('schedules a pending effect and does not set outageStopped immediately (Requirement 6.6)', () => {
    const s = session();
    const { session: s1 } = applyAction(s, { kind: 'do', target: 'terminate' });
    expect(s1.outageStopped).toBe(false);
    expect(s1.pendingEffects).toHaveLength(1);
    expect(s1.pendingEffects[0].effect.setsFlag).toBe('outage_stopped');
  });

  it('sets outageStopped once the clock reaches the landing minute', () => {
    const s = session();
    const { session: s1 } = applyAction(s, { kind: 'do', target: 'terminate' });
    // terminate costs 1 and delay is 1, so it lands at clock 1 + 1 = 2.
    // After terminate, clock is 1. We wait 1 more to reach landing.
    const { session: s2 } = applyAction(s1, { kind: 'wait' });
    expect(s2.outageStopped).toBe(true);
    expect(s2.stoppedAt).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// do — finish
// ---------------------------------------------------------------------------

describe('do action — finish outcome', () => {
  it('is blocked when outageStopped is false (Requirement 7.3/7.4)', () => {
    const s = session();
    // terminate first to put 're-enable' in done prerequisites... actually
    // 're-enable' requires 'terminate' (done), so we need to do terminate first.
    // But doing terminate doesn't stop outage immediately — we need the delay.
    // Let's use a scenario where finish requires terminate only.
    // The default session has: terminate (delayed, 1 min delay) → re-enable (requires terminate).
    // After terminate, re-enable's requires are met but outageStopped is false.
    const { session: s1 } = applyAction(s, { kind: 'do', target: 'terminate' });
    // terminate is done, requires met, but outageStopped still false (delay).
    const { events } = applyAction(s1, { kind: 'do', target: 're-enable' });
    expect(events[0].kind).toBe('blocked');
  });

  it('sets incidentFinished and finishedAt when outageStopped is true', () => {
    const s = session();
    const { session: s1 } = applyAction(s, { kind: 'do', target: 'terminate' });
    // Wait until the outage stops (landing minute = 2).
    const { session: s2 } = applyAction(s1, { kind: 'wait' });
    expect(s2.outageStopped).toBe(true);
    // Now re-enable should work.
    const { session: s3, events } = applyAction(s2, { kind: 'do', target: 're-enable' });
    expect(s3.incidentFinished).toBe(true);
    expect(s3.finishedAt).toBe(s3.clock);
    expect(events.some((e) => e.kind === 'finish')).toBe(true);
  });

  it('returns finished-already on subsequent actions (Requirement 4.6)', () => {
    const s = session();
    const { session: s1 } = applyAction(s, { kind: 'do', target: 'terminate' });
    const { session: s2 } = applyAction(s1, { kind: 'wait' });
    const { session: s3 } = applyAction(s2, { kind: 'do', target: 're-enable' });
    expect(s3.incidentFinished).toBe(true);
    const { events } = applyAction(s3, { kind: 'do', target: 'terminate' });
    expect(events[0]).toEqual({ kind: 'finished-already' });
  });
});

// ---------------------------------------------------------------------------
// do — not-understood
// ---------------------------------------------------------------------------

describe('do action — unknown target', () => {
  it('returns not-understood and leaves session unchanged (Requirement 4.3)', () => {
    const s = session();
    const { session: s1, events } = applyAction(s, { kind: 'do', target: 'bogus' });
    expect(events[0]).toEqual({ kind: 'not-understood', input: 'bogus' });
    expect(s1.clock).toBe(0);
    expect(s1.doneTargets).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// unknown participant
// ---------------------------------------------------------------------------

describe('unknown participant', () => {
  it('returns an error event and leaves session unchanged (Requirement 3.5)', () => {
    const s = session();
    const { session: s1, events } = applyAction(s, { kind: 'help' }, 'intruder');
    expect(events[0].kind).toBe('error');
    expect(s1.clock).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// action log
// ---------------------------------------------------------------------------

describe('action log', () => {
  it('records clockAtAction before the clock advances', () => {
    const s = session();
    const { session: s1 } = applyAction(s, { kind: 'do', target: 'terminate' });
    expect(s1.actionLog[0].clockAtAction).toBe(0);
    expect(s1.clock).toBe(1); // terminate costs 1
  });

  it('records the participant id', () => {
    const s = session();
    const { session: s1 } = applyAction(s, { kind: 'do', target: 'terminate' });
    expect(s1.actionLog[0].participantId).toBe('player');
  });
});

// ---------------------------------------------------------------------------
// immutability
// ---------------------------------------------------------------------------

describe('immutability', () => {
  it('does not mutate the input session', () => {
    const s = session();
    const snapshot = JSON.stringify(s);
    applyAction(s, { kind: 'do', target: 'terminate' });
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

// Suppress unused import lint warnings
export const _unused = { signal };
