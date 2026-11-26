// Clock advancement and effect resolution for the pure engine.
// Advances the Incident_Clock, fires time-triggered signals, and applies
// landed Delayed_Effects. Pure functions; no I/O of any kind.

import type { Session, Event } from './types.js';

/**
 * Advance `session.clock` by `minutes` and resolve all time-triggered signals
 * and landed Delayed_Effects.
 *
 * Returns a NEW immutable session and the events that occurred (Requirement 6).
 * The input session is never mutated.
 */
export function advanceClock(
  session: Session,
  minutes: number,
): { session: Session; events: Event[] } {
  const newClock = session.clock + minutes;
  const events: Event[] = [];

  // --- Step 1: Fire time-triggered signals in ascending minute order ---
  // A signal fires when arrivesAtMinute ≤ newClock and it has not yet fired.
  // Signals without arrivesAtMinute are "initial" signals delivered at session
  // creation by the host, not by this function.

  const firedTimeTriggers = new Set(session.firedTimeTriggers);
  const seenSignals = new Set(session.seenSignals);

  const pendingSignals = session.scenario.signals
    .filter(
      (s) =>
        s.arrivesAtMinute !== undefined &&
        s.arrivesAtMinute <= newClock &&
        !firedTimeTriggers.has(s.id),
    )
    .sort((a, b) => (a.arrivesAtMinute ?? 0) - (b.arrivesAtMinute ?? 0));

  for (const signal of pendingSignals) {
    firedTimeTriggers.add(signal.id);
    seenSignals.add(signal.id);
    events.push({ kind: 'signal', signalId: signal.id, text: signal.text });
  }

  // --- Step 2: Apply landed Delayed_Effects ---
  // Apply effects whose landsAtMinute ≤ newClock, sorted by (landsAtMinute, sequence).
  // Each effect applies exactly once and is removed from pendingEffects.

  const [landedEffects, remainingEffects] = partition(
    session.pendingEffects,
    (pe) => pe.landsAtMinute <= newClock,
  );

  // Sort landed effects by (landsAtMinute, sequence) — ascending.
  landedEffects.sort(
    (a, b) =>
      a.landsAtMinute - b.landsAtMinute ||
      a.sequence - b.sequence,
  );

  let outageStopped = session.outageStopped;
  let stoppedAt = session.stoppedAt;
  const flags = { ...session.flags };

  for (const pe of landedEffects) {
    if (pe.effect.setsFlag === 'outage_stopped') {
      outageStopped = true;
      stoppedAt = pe.landsAtMinute; // Requirement 7.5
      events.push({ kind: 'stop', text: pe.effect.text, clock: pe.landsAtMinute });
    }
  }

  const newSession: Session = {
    ...session,
    clock: newClock,
    outageStopped,
    stoppedAt,
    flags,
    seenSignals: [...seenSignals],
    firedTimeTriggers: [...firedTimeTriggers],
    pendingEffects: remainingEffects,
  };

  return { session: newSession, events };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Split `arr` into two arrays: [passing, failing]. */
function partition<T>(arr: T[], predicate: (x: T) => boolean): [T[], T[]] {
  const passing: T[] = [];
  const failing: T[] = [];
  for (const item of arr) {
    if (predicate(item)) passing.push(item);
    else failing.push(item);
  }
  return [passing, failing];
}
