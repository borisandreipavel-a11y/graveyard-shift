// Property-based tests for determinism (Task 16.12).
//
// P11: Determinism — same inputs produce same outputs
// Validates: Requirements 11.1, 11.2
//
// 11.1 — FOR ALL valid scenarios and FOR ALL sequences of actions, applying
//         the same sequence to a fresh session from the same scenario SHALL
//         produce exactly the same sequence of states, events, and debrief.
// 11.2 — THE Engine SHALL accept no sources of non-determinism: no Date.now(),
//         no Math.random(), no file system access, and no network access.
//
// The two properties below verify the observable consequence of 11.1 and 11.2:
// identical (scenario, action-sequence) inputs → identical outputs at every step.

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { applyAction } from '../dispatch.js';
import { createSession } from '../session.js';
import { validScenarioArb, actionSequenceArb } from './arbitraries.js';
import type { Session, Event } from '../types.js';

// ---------------------------------------------------------------------------
// Arbitrary: (scenario, action sequence) pair — same pattern as session.property.test.ts
// ---------------------------------------------------------------------------
const scenarioAndSeqArb = fc
  .tuple(validScenarioArb, fc.integer({ min: 0, max: 25 }))
  .chain(([scenario, len]) =>
    actionSequenceArb(scenario, len).map((seq) => ({ scenario, seq })),
  );

describe('P11: Determinism — same inputs produce same outputs', () => {
  // P11 (part A): Parallel runs — two fresh sessions from the same scenario,
  // driven by the same action sequence, must produce identical session and
  // events at every step.
  // Validates: Requirements 11.1, 11.2
  it('two independent sessions driven by the same sequence produce identical states and events at every step', () => {
    fc.assert(
      fc.property(scenarioAndSeqArb, ({ scenario, seq }) => {
        const r1 = createSession(scenario, [{ id: 'player' }]);
        const r2 = createSession(scenario, [{ id: 'player' }]);

        // validScenarioArb always produces valid scenarios; guard anyway.
        if ('error' in r1 || 'error' in r2) return false;

        let s1: Session = r1;
        let s2: Session = r2;

        // The two freshly created sessions must themselves be equal.
        expect(s1).toEqual(s2);

        for (const action of seq) {
          const out1 = applyAction(s1, action, 'player');
          const out2 = applyAction(s2, action, 'player');

          // Events returned for this step must be identical.
          expect(out1.events).toEqual(out2.events);

          // Session state after this step must be identical.
          expect(out1.session).toEqual(out2.session);

          s1 = out1.session;
          s2 = out2.session;
        }
      }),
      { numRuns: 100 },
    );
  });

  // P11 (part B): Replay from the beginning — record all intermediate
  // (session, events) pairs from one run, then replay the same sequence
  // from a fresh session and verify every intermediate state matches exactly.
  // Validates: Requirements 11.1, 11.2
  it('replaying the same action sequence from a fresh session reproduces every intermediate state and event list exactly', () => {
    fc.assert(
      fc.property(scenarioAndSeqArb, ({ scenario, seq }) => {
        const r1 = createSession(scenario, [{ id: 'player' }]);
        if ('error' in r1) return false;

        // --- First pass: record outcomes ---
        type Step = { session: Session; events: Event[] };
        const steps: Step[] = [];
        let cur: Session = r1;

        for (const action of seq) {
          const out = applyAction(cur, action, 'player');
          steps.push({ session: out.session, events: out.events });
          cur = out.session;
        }

        // --- Second pass (replay): must reproduce every recorded outcome ---
        const r2 = createSession(scenario, [{ id: 'player' }]);
        if ('error' in r2) return false;

        let replay: Session = r2;
        for (let i = 0; i < seq.length; i++) {
          const out = applyAction(replay, seq[i], 'player');

          expect(out.events).toEqual(steps[i].events);
          expect(out.session).toEqual(steps[i].session);

          replay = out.session;
        }
      }),
      { numRuns: 100 },
    );
  });
});
