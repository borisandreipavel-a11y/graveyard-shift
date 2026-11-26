// Action dispatch for the pure engine.
// Applies one Action to a Session and returns a NEW Session plus an Event list.
// Follows the dispatch flowchart in the design exactly. No I/O of any kind.

import type {
  Session,
  Action,
  Event,
  PendingEffect,
  ActionLogEntry,
} from './types.js';
import { advanceClock } from './clock.js';

/**
 * Apply `action` to `session` and return a new session and accumulated events.
 *
 * `participantId` identifies who took the action; it must match a participant
 * in the session's room (Requirement 3.5). It defaults to `'player'`, the id
 * used by the single-participant terminal runner.
 *
 * The input session is never mutated. Every returned session is a fresh
 * object built with structural copies (Requirement 11.1).
 */
export function applyAction(
  session: Session,
  action: Action,
  participantId = 'player',
): { session: Session; events: Event[] } {
  const { scenario } = session;

  // --- 1. Unknown participant (Requirement 3.5) ---
  const knownParticipant = session.room.participants.some(
    (p) => p.id === participantId,
  );
  if (!knownParticipant) {
    return {
      session,
      events: [
        { kind: 'error', message: `Unknown participant: '${participantId}'.` },
      ],
    };
  }

  // --- 2. Incident already finished (Requirement 4.6) ---
  if (session.incidentFinished) {
    return { session, events: [{ kind: 'finished-already' }] };
  }

  // --- 3. help action (Requirement 4.4): costs 0, no state change ---
  if (action.kind === 'help') {
    const lines = [
      'Available actions:',
      '',
      'Look targets:',
      ...scenario.targets.look.map(
        (t) => `  look ${t.id}  —  ${t.name}`,
      ),
      '',
      'Do targets:',
      ...scenario.targets.do.map(
        (t) => `  do ${t.id}  —  ${t.name}`,
      ),
    ];
    return { session, events: [{ kind: 'help', lines }] };
  }

  // --- 4. wait action (Requirement 4.5) ---
  if (action.kind === 'wait') {
    const clockAtAction = session.clock;
    const { session: s1, events } = advanceClock(session, scenario.costs.wait);
    const logEntry: ActionLogEntry = { action, participantId, clockAtAction };
    const s2: Session = { ...s1, actionLog: [...s1.actionLog, logEntry] };
    return { session: s2, events };
  }

  // --- 5. look action ---
  if (action.kind === 'look') {
    const target = scenario.targets.look.find((t) => t.id === action.target);
    if (!target) {
      return {
        session,
        events: [{ kind: 'not-understood', input: action.target }],
      };
    }

    const clockAtAction = session.clock;
    const isRepeat = session.lookedTargets.includes(action.target);
    const text =
      isRepeat && target.descriptionOnRepeat != null
        ? target.descriptionOnRepeat
        : target.description;

    const { session: s1, events: clockEvents } = advanceClock(
      session,
      target.cost,
    );
    const lookedTargets = isRepeat
      ? s1.lookedTargets
      : [...s1.lookedTargets, action.target];
    const logEntry: ActionLogEntry = { action, participantId, clockAtAction };
    const s2: Session = {
      ...s1,
      lookedTargets,
      actionLog: [...s1.actionLog, logEntry],
    };
    return { session: s2, events: [{ kind: 'text', text }, ...clockEvents] };
  }

  // --- 6. do action ---
  if (action.kind === 'do') {
    const target = scenario.targets.do.find((t) => t.id === action.target);
    if (!target) {
      return {
        session,
        events: [{ kind: 'not-understood', input: action.target }],
      };
    }

    const clockAtAction = session.clock;

    // Precondition check (Requirement 5) and the finish guard (Requirement 7.3/7.4).
    const unmetRequires = (target.requires ?? []).filter(
      (r) => !session.doneTargets.includes(r),
    );
    const isFinishAction = target.outcome.kind === 'finish';
    const finishBlocked = isFinishAction && !session.outageStopped;

    if (unmetRequires.length > 0 || finishBlocked) {
      const message = finishBlocked
        ? 'The outage has not been stopped yet. Stop the outage first.'
        : `Blocked: you need to complete '${unmetRequires.join("', '")}' first.`;
      const { session: s1, events: clockEvents } = advanceClock(
        session,
        scenario.costs.blocked,
      );
      const logEntry: ActionLogEntry = { action, participantId, clockAtAction };
      const s2: Session = { ...s1, actionLog: [...s1.actionLog, logEntry] };
      return {
        session: s2,
        events: [{ kind: 'blocked', message }, ...clockEvents],
      };
    }

    // Preconditions met — apply the outcome.
    const outcome = target.outcome;

    // For delayed outcomes: schedule the effect BEFORE advancing the clock
    // (Requirement 6.6: nothing applies at action time).
    let pendingEffects = session.pendingEffects;
    if (outcome.kind === 'delayed') {
      const pe: PendingEffect = {
        landsAtMinute: clockAtAction + target.cost + outcome.effect.delayMinutes,
        sourceActionId: target.id,
        sequence: session.pendingEffects.length,
        effect: outcome.effect,
      };
      pendingEffects = [...pendingEffects, pe];
    }

    const sessionWithPending: Session = { ...session, pendingEffects };

    // Advance the clock; this also fires time triggers and landed effects.
    const { session: s1, events: clockEvents } = advanceClock(
      sessionWithPending,
      target.cost,
    );

    // Outcome-specific events and state changes.
    let flags = { ...s1.flags };
    let incidentFinished = s1.incidentFinished;
    let finishedAt = s1.finishedAt;
    let extraEvents: Event[] = [];

    switch (outcome.kind) {
      case 'reveals':
      case 'dead-end':
      case 'fails':
        extraEvents = [{ kind: 'text', text: outcome.text }];
        break;
      case 'progress':
        flags = { ...flags, [outcome.flag]: true };
        extraEvents = [{ kind: 'text', text: target.description }];
        break;
      case 'delayed':
        extraEvents = [{ kind: 'text', text: target.description }];
        break;
      case 'finish':
        incidentFinished = true;
        finishedAt = s1.clock; // Requirement 7.6
        extraEvents = [
          { kind: 'finish', text: target.description, clock: s1.clock },
        ];
        break;
    }

    const doneTargets = [...s1.doneTargets, target.id];
    const logEntry: ActionLogEntry = { action, participantId, clockAtAction };

    const s2: Session = {
      ...s1,
      flags,
      doneTargets,
      incidentFinished,
      finishedAt,
      actionLog: [...s1.actionLog, logEntry],
    };

    // Event order: outcome text first, then clock-driven events.
    return { session: s2, events: [...extraEvents, ...clockEvents] };
  }

  // TypeScript exhaustiveness guard.
  const _exhaustive: never = action;
  return _exhaustive;
}
