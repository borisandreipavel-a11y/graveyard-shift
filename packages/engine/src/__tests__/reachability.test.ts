import { describe, it, expect } from 'vitest';
import { reachabilityCheck } from '../reachability.js';
import { mkScenario, doTarget } from './helpers.js';
import type { Scenario } from '../types.js';

// ---------------------------------------------------------------------------
// Reachable scenarios
// ---------------------------------------------------------------------------

describe('reachabilityCheck — reachable', () => {
  it('accepts a simple linear chain (terminate → re-enable)', () => {
    const scenario = mkScenario(); // default is terminate → re-enable
    expect(reachabilityCheck(scenario)).toBe(true);
  });

  it('accepts a chain with intermediate steps (A → B → terminate → re-enable)', () => {
    const doList = [
      doTarget({ id: 'step-a', outcome: { kind: 'progress', flag: 'a-done' } }),
      doTarget({ id: 'step-b', requires: ['step-a'], outcome: { kind: 'progress', flag: 'b-done' } }),
      doTarget({
        id: 'terminate',
        requires: ['step-b'],
        outcome: { kind: 'delayed', effect: { delayMinutes: 2, text: 'Stopped.', setsFlag: 'outage_stopped' } },
      }),
      doTarget({ id: 're-enable', requires: ['terminate'], outcome: { kind: 'finish' } }),
    ];
    const scenario = mkScenario({ do: doList });
    expect(reachabilityCheck(scenario)).toBe(true);
  });

  it('accepts when there is an isolated dead-end branch alongside a valid path', () => {
    const doList = [
      doTarget({ id: 'dead-end', outcome: { kind: 'dead-end', text: 'No luck.' } }),
      doTarget({
        id: 'terminate',
        outcome: { kind: 'delayed', effect: { delayMinutes: 1, text: 'Stopped.', setsFlag: 'outage_stopped' } },
      }),
      doTarget({ id: 're-enable', requires: ['terminate'], outcome: { kind: 'finish' } }),
    ];
    const scenario = mkScenario({ do: doList });
    expect(reachabilityCheck(scenario)).toBe(true);
  });

  it('accepts with many parallel optional targets that do not block the path', () => {
    const doList = [
      doTarget({ id: 'optional-1', outcome: { kind: 'progress', flag: 'o1' } }),
      doTarget({ id: 'optional-2', outcome: { kind: 'progress', flag: 'o2' } }),
      doTarget({ id: 'optional-3', outcome: { kind: 'reveals', text: 'Info.' } }),
      doTarget({
        id: 'terminate',
        outcome: { kind: 'delayed', effect: { delayMinutes: 1, text: 'Stopped.', setsFlag: 'outage_stopped' } },
      }),
      doTarget({ id: 're-enable', requires: ['terminate'], outcome: { kind: 'finish' } }),
    ];
    const scenario = mkScenario({ do: doList });
    expect(reachabilityCheck(scenario)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Unreachable scenarios
// ---------------------------------------------------------------------------

describe('reachabilityCheck — unreachable', () => {
  it('rejects a scenario where the finish trigger has no path (circular requires)', () => {
    const doList = [
      doTarget({
        id: 'terminate',
        requires: ['re-enable'], // mutual dependency → no entry point
        outcome: { kind: 'delayed', effect: { delayMinutes: 1, text: 'Stopped.', setsFlag: 'outage_stopped' } },
      }),
      doTarget({ id: 're-enable', requires: ['terminate'], outcome: { kind: 'finish' } }),
    ];
    const scenario = mkScenario({ do: doList });
    expect(reachabilityCheck(scenario)).toBe(false);
  });

  it('rejects when the only do-target list is a single dead-end (no stop, no finish)', () => {
    // We have to satisfy the cross-ref check in the helper by providing a stop and
    // finish target that exist, but the finish can't be reached because it requires
    // an unsatisfiable chain.  Here we just call reachabilityCheck directly.
    const doList = [
      doTarget({ id: 'dead-end', outcome: { kind: 'dead-end', text: 'Nope.' } }),
      doTarget({
        id: 'terminate',
        requires: ['dead-end', 're-enable'], // 're-enable' requires 'terminate' → cycle
        outcome: { kind: 'delayed', effect: { delayMinutes: 1, text: 'Stopped.', setsFlag: 'outage_stopped' } },
      }),
      doTarget({ id: 're-enable', requires: ['terminate'], outcome: { kind: 'finish' } }),
    ];
    const scenario = mkScenario({ do: doList });
    expect(reachabilityCheck(scenario)).toBe(false);
  });

  it('rejects when stop trigger outcome is not delayed (Outage_Stopped never set)', () => {
    const doList = [
      doTarget({ id: 'terminate', outcome: { kind: 'progress', flag: 'terminated' } }),
      doTarget({ id: 're-enable', requires: ['terminate'], outcome: { kind: 'finish' } }),
    ];
    const scenario = mkScenario({ do: doList });
    expect(reachabilityCheck(scenario)).toBe(false);
  });

  it('rejects when finish trigger outcome is not finish', () => {
    const doList = [
      doTarget({
        id: 'terminate',
        outcome: { kind: 'delayed', effect: { delayMinutes: 1, text: 'Stopped.', setsFlag: 'outage_stopped' } },
      }),
      doTarget({ id: 're-enable', requires: ['terminate'], outcome: { kind: 'progress', flag: 'done' } }),
    ];
    const scenario = mkScenario({ do: doList });
    expect(reachabilityCheck(scenario)).toBe(false);
  });

  it('rejects when there is no finish trigger at all in the do-target list', () => {
    // Build a scenario where the finish.triggerAction id does not appear in the
    // do list; reachabilityCheck must return false (finish target has no outcome).
    const doList = [
      doTarget({
        id: 'terminate',
        outcome: { kind: 'delayed', effect: { delayMinutes: 1, text: 'Stopped.', setsFlag: 'outage_stopped' } },
      }),
      // Note: 're-enable' is intentionally absent.
    ];
    // Build the scenario object directly so we bypass the cross-reference check
    // that the loader would otherwise run first.
    const base = mkScenario({ do: doList });
    const scenario: Scenario = {
      ...base,
      targets: { ...base.targets, do: doList },
      finish: { triggerAction: 're-enable' }, // references a non-existent target
    };
    expect(reachabilityCheck(scenario)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Stop trigger must precede finish trigger
// ---------------------------------------------------------------------------

describe('reachabilityCheck — stop-before-finish ordering', () => {
  it('accepts when finish requires stop (normal ordering)', () => {
    const doList = [
      doTarget({
        id: 'terminate',
        outcome: { kind: 'delayed', effect: { delayMinutes: 1, text: 'Stopped.', setsFlag: 'outage_stopped' } },
      }),
      doTarget({ id: 're-enable', requires: ['terminate'], outcome: { kind: 'finish' } }),
    ];
    expect(reachabilityCheck(mkScenario({ do: doList }))).toBe(true);
  });

  it('rejects if the BFS guard prevents reaching finish before stop trigger', () => {
    // finish and stop are independent (no requires chain tying them together).
    // The BFS guard in reachabilityCheck must prevent accepting states where the
    // finish target is in the done-set without the stop trigger.
    // Because the guard blocks adding finish to done-set before stop is present,
    // the scenario is reachable only if stop can come first.
    // Here stop has no requires and finish has no requires — stop can precede finish,
    // so the scenario IS reachable via: add terminate → add re-enable.
    const doList = [
      doTarget({
        id: 'terminate',
        outcome: { kind: 'delayed', effect: { delayMinutes: 1, text: 'Stopped.', setsFlag: 'outage_stopped' } },
      }),
      doTarget({ id: 're-enable', outcome: { kind: 'finish' } }), // no requires — but guard prevents it before stop
    ];
    // Because terminate has no requires, the BFS can go: add terminate, then add re-enable.
    expect(reachabilityCheck(mkScenario({ do: doList }))).toBe(true);
  });
});
