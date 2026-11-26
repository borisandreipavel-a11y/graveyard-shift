// Unit tests for clock advancement and delayed-effect resolution (Task 7.2).
// Requirements: 6.2, 6.3, 6.4, 6.5, 6.7, 6.8, 6.9

import { describe, it, expect } from 'vitest';
import { advanceClock } from '../clock.js';
import { createSession } from '../session.js';
import { mkScenario, doTarget, signal } from './helpers.js';
import type { Session, PendingEffect } from '../types.js';

function session(): Session {
  // Use a scenario with no time-triggered signals so clock tests
  // start with a clean event slate.
  const scenario = mkScenario({ signals: [] });
  const result = createSession(scenario, [{ id: 'player' }]);
  return result as Exclude<typeof result, { error: string }>;
}

function withPendingEffects(
  s: Session,
  effects: PendingEffect[],
): Session {
  return { ...s, pendingEffects: [...s.pendingEffects, ...effects] };
}

describe('advanceClock', () => {
  it('advance by 0 leaves the clock unchanged and emits no events', () => {
    const s = session();
    const { session: s1, events } = advanceClock(s, 0);
    expect(s1.clock).toBe(0);
    expect(events).toEqual([]);
  });

  it('fires a time-triggered signal when the clock passes its minute', () => {
    const scenario = mkScenario({
      signals: [signal({ id: 'sig-traffic', arrivesAtMinute: 2 })],
    });
    const s = createSession(scenario, [{ id: 'player' }]) as Session;
    const { session: s1, events } = advanceClock(s, 2);
    expect(events).toEqual([
      { kind: 'signal', signalId: 'sig-traffic', text: s.scenario.signals[0].text },
    ]);
    expect(s1.firedTimeTriggers).toContain('sig-traffic');
  });

  it('fires multiple triggers in one step in ascending minute order', () => {
    const scenario = mkScenario({
      signals: [
        signal({ id: 'sig-b', arrivesAtMinute: 5 }),
        signal({ id: 'sig-a', arrivesAtMinute: 3 }),
        signal({ id: 'sig-c', arrivesAtMinute: 4 }),
      ],
    });
    const s = createSession(scenario, [{ id: 'player' }]) as Session;
    const { events } = advanceClock(s, 10);
    expect(events.map((e) => (e as { signalId: string }).signalId)).toEqual([
      'sig-a',
      'sig-c',
      'sig-b',
    ]);
  });

  it('fires each trigger only once across multiple advances (Requirement 6.5)', () => {
    const scenario = mkScenario({
      signals: [signal({ id: 'sig-x', arrivesAtMinute: 2 })],
    });
    const s = createSession(scenario, [{ id: 'player' }]) as Session;
    const first = advanceClock(s, 3);
    const second = advanceClock(first.session, 5);
    const third = advanceClock(second.session, 5);
    const allSignalEvents = [...first.events, ...second.events, ...third.events]
      .filter((e) => e.kind === 'signal');
    expect(allSignalEvents).toHaveLength(1);
  });

  it('does not fire a trigger at minute m when advancing to less than m', () => {
    const scenario = mkScenario({
      signals: [signal({ id: 'sig-late', arrivesAtMinute: 5 })],
    });
    const s = createSession(scenario, [{ id: 'player' }]) as Session;
    const { events } = advanceClock(s, 4);
    expect(events).toEqual([]);
  });

  it('does not fire signals without arrivesAtMinute (initial signals)', () => {
    const scenario = mkScenario({
      signals: [signal({ id: 'sig-page', arrivesAtMinute: undefined })],
    });
    const s = createSession(scenario, [{ id: 'player' }]) as Session;
    const { events } = advanceClock(s, 10);
    expect(events).toEqual([]);
  });

  it('applies a landed delayed effect when the clock reaches its landing minute', () => {
    const s = withPendingEffects(session(), [
      {
        landsAtMinute: 5,
        sourceActionId: 'terminate',
        sequence: 0,
        effect: { delayMinutes: 2, text: 'Outage stops.', setsFlag: 'outage_stopped' },
      },
    ]);
    const { session: s1, events } = advanceClock(s, 5);
    expect(s1.outageStopped).toBe(true);
    expect(s1.stoppedAt).toBe(5);
    expect(s1.pendingEffects).toHaveLength(0);
    expect(events).toContainEqual({ kind: 'stop', text: 'Outage stops.', clock: 5 });
  });

  it('does not apply the effect before the landing minute', () => {
    const s = withPendingEffects(session(), [
      {
        landsAtMinute: 5,
        sourceActionId: 'terminate',
        sequence: 0,
        effect: { delayMinutes: 2, text: 'Outage stops.', setsFlag: 'outage_stopped' },
      },
    ]);
    const { session: s1, events } = advanceClock(s, 4);
    expect(s1.outageStopped).toBe(false);
    expect(s1.pendingEffects).toHaveLength(1);
    expect(events).toEqual([]);
  });

  it('applies effects at the same landing minute in sequence order (Requirement 6.9)', () => {
    const s = withPendingEffects(session(), [
      {
        landsAtMinute: 5,
        sourceActionId: 'later-action',
        sequence: 1,
        effect: { delayMinutes: 1, text: 'Second effect.', setsFlag: 'outage_stopped' },
      },
      {
        landsAtMinute: 5,
        sourceActionId: 'earlier-action',
        sequence: 0,
        effect: { delayMinutes: 1, text: 'First effect.', setsFlag: 'outage_stopped' },
      },
    ]);
    const { events } = advanceClock(s, 5);
    const stopEvents = events.filter((e) => e.kind === 'stop');
    expect(stopEvents.map((e) => (e as { text: string }).text)).toEqual([
      'First effect.',
      'Second effect.',
    ]);
  });

  it('applies each effect exactly once across multiple advances (Requirement 6.8)', () => {
    const s = withPendingEffects(session(), [
      {
        landsAtMinute: 3,
        sourceActionId: 'terminate',
        sequence: 0,
        stop: undefined,
        effect: { delayMinutes: 2, text: 'Outage stops.', setsFlag: 'outage_stopped' },
      } as PendingEffect,
    ]);
    const first = advanceClock(s, 3);
    const second = advanceClock(first.session, 5);
    const allStops = [...first.events, ...second.events].filter((e) => e.kind === 'stop');
    expect(allStops).toHaveLength(1);
    expect(second.session.pendingEffects).toHaveLength(0);
  });

  it('never decreases the clock (Requirement 6.2)', () => {
    const s = session();
    const { session: s1 } = advanceClock(s, 5);
    const { session: s2 } = advanceClock(s1, 3);
    expect(s2.clock).toBeGreaterThanOrEqual(s1.clock);
  });

  it('returns a new session object and does not mutate the input', () => {
    const s = withPendingEffects(session(), [
      {
        landsAtMinute: 5,
        sourceActionId: 'terminate',
        sequence: 0,
        effect: { delayMinutes: 2, text: 'Outage stops.', setsFlag: 'outage_stopped' },
      },
    ]);
    const snapshot = JSON.stringify(s);
    advanceClock(s, 10);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

// Silence unused-import lint for doTarget (used indirectly via helpers scenario shapes).
export const _unused = { doTarget };
