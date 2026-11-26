// Property-based tests for session flag monotone invariants (Task 16.9).
//
// P8: Session flag monotone invariants
// Validates: Requirements 7.3, 7.4, 7.5, 7.6, 7.7
//
// 7.3 — incidentFinished implies outageStopped.
// 7.4 — while outageStopped is false, incidentFinished is never set.
// 7.5 — when outageStopped is set, stoppedAt records the landing clock value.
// 7.6 — when incidentFinished is set, finishedAt records the landing clock value.
// 7.7 — flags never revert; stoppedAt/finishedAt never change once recorded.

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { applyAction } from '../dispatch.js';
import { createSession } from '../session.js';
import { validScenarioArb, actionSequenceArb } from './arbitraries.js';
import type { Session } from '../types.js';

// ---------------------------------------------------------------------------
// Arbitrary: (scenario, action sequence) pair
// Use .chain so the action sequence is generated from the same scenario.
// ---------------------------------------------------------------------------
const scenarioAndSeqArb = fc
  .tuple(validScenarioArb, fc.integer({ min: 0, max: 25 }))
  .chain(([scenario, len]) =>
    actionSequenceArb(scenario, len).map((seq) => ({ scenario, seq })),
  );

describe('P8: Session flag monotone invariants', () => {
  // P8: Session flag monotone invariants — Req 7.3, 7.4, 7.5, 7.6, 7.7
  it('baseline — fresh session satisfies all invariants', () => {
    fc.assert(
      fc.property(validScenarioArb, (scenario) => {
        const result = createSession(scenario, [{ id: 'player' }]);
        if ('error' in result) return false; // validScenarioArb always has a valid path

        const s = result;
        // Req 7.4: outageStopped false → incidentFinished must be false.
        if (s.outageStopped === false && s.incidentFinished !== false) return false;
        // Req 7.3: incidentFinished → outageStopped.
        if (s.incidentFinished && !s.outageStopped) return false;
        // Req 7.5: stoppedAt is null while outageStopped is false.
        if (!s.outageStopped && s.stoppedAt !== null) return false;
        // Req 7.6: finishedAt is null while incidentFinished is false.
        if (!s.incidentFinished && s.finishedAt !== null) return false;
        return true;
      }),
    );
  });

  // P8: Session flag monotone invariants — Req 7.3, 7.4, 7.5, 7.6, 7.7
  it('invariants hold after every step of any action sequence', () => {
    fc.assert(
      fc.property(scenarioAndSeqArb, ({ scenario, seq }) => {
        const result = createSession(scenario, [{ id: 'player' }]);
        if ('error' in result) return false;
        let session: Session = result;

        let prevOutageStopped = session.outageStopped;
        let prevIncidentFinished = session.incidentFinished;
        let prevStoppedAt = session.stoppedAt;
        let prevFinishedAt = session.finishedAt;

        for (const action of seq) {
          const { session: next } = applyAction(session, action, 'player');

          // Req 7.3 / 7.4: incidentFinished ⟹ outageStopped.
          if (next.incidentFinished && !next.outageStopped) return false;

          // Req 7.7: outageStopped never reverts from true to false.
          if (prevOutageStopped && !next.outageStopped) return false;

          // Req 7.7: incidentFinished never reverts from true to false.
          if (prevIncidentFinished && !next.incidentFinished) return false;

          // Req 7.5: once outageStopped is true, stoppedAt must be a non-null integer.
          if (next.outageStopped) {
            if (
              next.stoppedAt === null ||
              !Number.isInteger(next.stoppedAt) ||
              next.stoppedAt < 0
            )
              return false;
          }

          // Req 7.6: once incidentFinished is true, finishedAt must be a non-null integer.
          if (next.incidentFinished) {
            if (
              next.finishedAt === null ||
              !Number.isInteger(next.finishedAt) ||
              next.finishedAt < 0
            )
              return false;
          }

          // Req 7.7: stoppedAt never changes once recorded.
          if (prevStoppedAt !== null) {
            if (next.stoppedAt === null) return false;         // must not go back to null
            if (next.stoppedAt !== prevStoppedAt) return false; // must not change value
          }

          // Req 7.7: finishedAt never changes once recorded.
          if (prevFinishedAt !== null) {
            if (next.finishedAt === null) return false;         // must not go back to null
            if (next.finishedAt !== prevFinishedAt) return false; // must not change value
          }

          prevOutageStopped = next.outageStopped;
          prevIncidentFinished = next.incidentFinished;
          prevStoppedAt = next.stoppedAt;
          prevFinishedAt = next.finishedAt;
          session = next;
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });
});
