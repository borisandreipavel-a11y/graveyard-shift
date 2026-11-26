// Reachability check for the engine.
// Verifies that at least one sequence of actions from the initial state reaches
// Incident_Finished. This is a pure BFS over the abstract done-set state space.
// No I/O of any kind; no randomness.

import type { Scenario } from './types.js';

/**
 * Returns true iff the scenario is completable: at least one sequence of
 * do-actions from the empty done-set leads to a state where the finish
 * trigger's requirements are met and `outageStopped` is true (i.e. the stop
 * trigger is in the done-set).
 *
 * State: Set<string> of completed do-target ids.
 * Edge:  Any do-target whose `requires` are all in the current done-set.
 *        `wait` does not change the done-set so it adds no new states.
 *
 * Accept iff the done-set includes the stop trigger AND the finish trigger,
 * and the finish target's `requires` are satisfied (they always are if the
 * done-set includes the finish trigger, because we only add an id to the
 * done-set when its requires are met).
 */
export function reachabilityCheck(scenario: Scenario): boolean {
  const { targets, stop, finish } = scenario;

  // The finish trigger must be a target whose outcome actually sets
  // Incident_Finished (kind: 'finish'); otherwise no accepting state exists
  // at runtime regardless of the done-set.
  const finishTarget = targets.do.find((t) => t.id === finish.triggerAction);
  if (!finishTarget || finishTarget.outcome.kind !== 'finish') {
    return false;
  }

  // The stop trigger must schedule the delayed effect that sets
  // Outage_Stopped; otherwise Outage_Stopped is never true and the finish
  // action is permanently blocked (Requirement 7.3/7.4).
  const stopTarget = targets.do.find((t) => t.id === stop.triggerAction);
  if (!stopTarget || stopTarget.outcome.kind !== 'delayed') {
    return false;
  }

  // We need to reach a state where:
  // 1. The stop trigger is in the done-set (outageStopped becomes true when the
  //    delayed effect lands — but the check models it as the stop trigger being
  //    in the done-set, because the delay is always > 0 and the finish action
  //    takes ≥ 1 minute, so the stop effect always lands before or at finish).
  // 2. The finish trigger is in the done-set.
  //
  // BFS. Each node = sorted, comma-joined done-set string (cheap visited key).

  const visited = new Set<string>();
  const queue: Set<string>[] = [new Set<string>()];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const key = [...current].sort().join(',');

    if (visited.has(key)) continue;
    visited.add(key);

    // Check accept condition.
    if (current.has(stop.triggerAction) && current.has(finish.triggerAction)) {
      return true;
    }

    // Expand: try every do-target whose requires are all satisfied.
    for (const target of targets.do) {
      if (current.has(target.id)) continue; // already done
      const requires = target.requires ?? [];
      if (requires.every((r) => current.has(r))) {
        // Guard: finish trigger is only reachable when stop trigger is done.
        // This models the runtime guard in dispatch (Requirement 7.3/7.4).
        if (target.id === finish.triggerAction && !current.has(stop.triggerAction)) {
          continue;
        }
        const next = new Set(current);
        next.add(target.id);
        queue.push(next);
      }
    }
  }

  // No accepting state reached.
  return false;
}
