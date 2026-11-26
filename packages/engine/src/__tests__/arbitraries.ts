// fast-check arbitraries for the engine package.
// All arbitraries are pure; no I/O of any kind.
//
// validScenarioArb uses structural construction (not filter) to guarantee
// every generated Scenario passes loadScenario on the first try.

import * as fc from 'fast-check';
import type {
  Participant,
  LookTarget,
  DoTarget,
  Scenario,
  Action,
  Signal,
} from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Non-empty alphanumeric string of 1–12 chars — safe as an identifier. */
const idPartArb: fc.Arbitrary<string> = fc.stringMatching(/^[a-z][a-z0-9]{0,11}$/).filter(
  (s) => s.length >= 1,
);

/** Non-empty human-readable text, 1–60 chars. */
const textArb: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 60 });

// ---------------------------------------------------------------------------
// participantArb
// ---------------------------------------------------------------------------

export const participantArb: fc.Arbitrary<Participant> = fc.record({
  id: idPartArb,
});

// ---------------------------------------------------------------------------
// lookTargetArb
// ---------------------------------------------------------------------------

export const lookTargetArb: fc.Arbitrary<LookTarget> = fc.record({
  id: idPartArb,
  name: textArb,
  description: textArb,
  descriptionOnRepeat: fc.option(textArb, { nil: undefined }),
  cost: fc.constant(1 as const),
  reconstruction: fc.option(fc.boolean(), { nil: undefined }),
});

// ---------------------------------------------------------------------------
// doTargetArb
// ---------------------------------------------------------------------------

/** Generates all six outcome kinds. */
const doTargetOutcomeArb = fc.oneof(
  fc.record({ kind: fc.constant('reveals' as const), text: textArb }),
  fc.record({ kind: fc.constant('dead-end' as const), text: textArb }),
  fc.record({ kind: fc.constant('fails' as const), text: textArb }),
  fc.record({
    kind: fc.constant('delayed' as const),
    effect: fc.record({
      delayMinutes: fc.integer({ min: 0, max: 10 }),
      text: textArb,
      setsFlag: fc.constant('outage_stopped' as const),
    }),
  }),
  fc.record({
    kind: fc.constant('progress' as const),
    flag: idPartArb,
  }),
  fc.record({ kind: fc.constant('finish' as const) }),
);

/**
 * Generates a DoTarget with no `requires` array (the validScenarioArb builder
 * wires requires manually). The exported arb is useful for unit tests that
 * only need a syntactically valid target object.
 */
export const doTargetArb: fc.Arbitrary<DoTarget> = fc.record({
  id: idPartArb,
  name: textArb,
  description: textArb,
  blockedMessage: fc.option(textArb, { nil: undefined }),
  cost: fc.integer({ min: 0, max: 10 }),
  requires: fc.option(fc.array(idPartArb, { minLength: 0, maxLength: 3 }), {
    nil: undefined,
  }),
  outcome: doTargetOutcomeArb,
  reconstruction: fc.option(fc.boolean(), { nil: undefined }),
}) as fc.Arbitrary<DoTarget>;

// ---------------------------------------------------------------------------
// validScenarioArb
// ---------------------------------------------------------------------------

/**
 * Structural construction strategy (see task description).
 *
 * Step 1  — 1–3 unique look-target ids
 * Step 2  — 2–4 unique "leaf" do-target ids, disjoint from look ids
 * Step 3  — stop-trigger id, outcome: delayed (setsFlag: 'outage_stopped')
 * Step 4  — finish-trigger id, outcome: finish, requires: [stopTriggerId]
 * Step 5  — build do list: leafs + stop + finish
 * Step 6  — 1–2 signal objects; first signal id goes in initialSignals
 * Step 7  — compose and return
 *
 * This guarantees the BFS path:
 *   empty → (do any leafs) → (do stop-trigger) → (do finish-trigger)
 */
export const validScenarioArb: fc.Arbitrary<Scenario> = fc
  .tuple(
    // [0] number of look targets: 1–3
    fc.integer({ min: 1, max: 3 }),
    // [1] number of leaf do-targets: 2–4
    fc.integer({ min: 2, max: 4 }),
    // [2] number of signals: 1–2
    fc.integer({ min: 1, max: 2 }),
    // [3] whether the stop-trigger requires some leaf ids (bool)
    fc.boolean(),
    // [4] scenario id suffix
    idPartArb,
    // [5] scenario title
    textArb,
    // [6] source url path segment (we build a valid URL from it)
    idPartArb,
    // [7] source title
    textArb,
    // [8] reconstructionNote
    textArb,
    // [9] wait cost
    fc.integer({ min: 1, max: 5 }),
    // [10] blocked cost
    fc.integer({ min: 1, max: 5 }),
    // [11] sourceDurations
    fc.record({
      pageToIdentified: fc.integer({ min: 1, max: 60 }),
      pageToSwitchOff: fc.integer({ min: 1, max: 120 }),
      pageToRecovery: fc.integer({ min: 1, max: 180 }),
      switchOffToWafRestored: fc.integer({ min: 1, max: 120 }),
      outageFromDeploy: fc.integer({ min: 1, max: 300 }),
    }),
    // [12] costsAreEstimates
    fc.boolean(),
    // [13] real-timeline entries count: 1–3
    fc.integer({ min: 1, max: 3 }),
    // [14] leaf do-target cost values
    fc.array(fc.integer({ min: 1, max: 5 }), { minLength: 4, maxLength: 4 }),
    // [15] leaf do-target outcome texts
    fc.array(textArb, { minLength: 4, maxLength: 4 }),
    // [16] stop target description text
    textArb,
    // [17] finish target description text
    textArb,
    // [18] signal texts
    fc.array(textArb, { minLength: 2, maxLength: 2 }),
    // [19] real timeline descriptions
    fc.array(textArb, { minLength: 3, maxLength: 3 }),
  )
  .map(
    ([
      numLook,
      numLeafDo,
      numSignals,
      stopRequiresLeaf,
      idSuffix,
      title,
      srcPath,
      srcTitle,
      reconstructionNote,
      waitCost,
      blockedCost,
      sourceDurations,
      costsAreEstimates,
      numTimeline,
      leafCosts,
      leafTexts,
      stopDesc,
      finishDesc,
      signalTexts,
      timelineDescs,
    ]) => {
      // --- Step 1: look-target ids ---
      const lookIds = Array.from(
        { length: numLook },
        (_, i) => `look-${idSuffix}-${i}`,
      );

      // --- Step 2: leaf do-target ids (disjoint from look ids) ---
      const leafIds = Array.from(
        { length: numLeafDo },
        (_, i) => `leaf-${idSuffix}-${i}`,
      );

      // --- Step 3: stop trigger ---
      const stopId = `stop-${idSuffix}`;
      // Optionally require the first leaf id.
      const stopRequires: string[] =
        stopRequiresLeaf && leafIds.length > 0 ? [leafIds[0]] : [];

      const stopTarget: DoTarget = {
        id: stopId,
        name: `stop ${stopId}`,
        description: stopDesc,
        cost: 1,
        requires: stopRequires.length > 0 ? stopRequires : undefined,
        outcome: {
          kind: 'delayed',
          effect: {
            delayMinutes: 1,
            text: 'Outage stopped.',
            setsFlag: 'outage_stopped',
          },
        },
      };

      // --- Step 4: finish trigger ---
      const finishId = `finish-${idSuffix}`;
      const finishTarget: DoTarget = {
        id: finishId,
        name: `finish ${finishId}`,
        description: finishDesc,
        cost: 1,
        requires: [stopId],
        outcome: { kind: 'finish' },
      };

      // --- Step 5: leaf do-targets ---
      // Outcomes cycle through non-delayed, non-finish kinds.
      const leafOutcomeKinds = ['reveals', 'progress', 'dead-end', 'fails'] as const;
      const leafTargets: DoTarget[] = leafIds.map((id, i) => {
        const kind = leafOutcomeKinds[i % leafOutcomeKinds.length];
        const text = leafTexts[i] ?? `result of ${id}`;
        const outcome: DoTarget['outcome'] =
          kind === 'progress'
            ? { kind: 'progress', flag: `${id}-done` }
            : { kind, text };
        return {
          id,
          name: `do ${id}`,
          description: text,
          cost: leafCosts[i] ?? 1,
          outcome,
        };
      });

      // --- Compose do list ---
      const doList: DoTarget[] = [...leafTargets, stopTarget, finishTarget];

      // --- Step 1 continued: look-targets ---
      const lookTargets: LookTarget[] = lookIds.map((id) => ({
        id,
        name: `look at ${id}`,
        description: `You see ${id}.`,
        cost: 1 as const,
      }));

      // --- Step 6: signals ---
      const signalList: Signal[] = Array.from(
        { length: numSignals },
        (_, i) => ({
          id: `sig-${idSuffix}-${i}`,
          text: signalTexts[i] ?? `Signal ${i}`,
          arrivesAtMinute: i === 0 ? 0 : i,
        }),
      );
      const initialSignals = [signalList[0].id];

      // --- Step 7: real timeline ---
      const realTimeline = Array.from(
        { length: numTimeline },
        (_, i) => ({
          utcTimestamp: `${String(i).padStart(2, '0')}:00`,
          description: timelineDescs[i] ?? `Event ${i}`,
        }),
      );

      const scenario: Scenario = {
        id: `scenario-${idSuffix}`,
        title,
        source: {
          url: `https://example.com/${srcPath}`,
          title: srcTitle,
        },
        reconstructionNote,
        initialSignals,
        signals: signalList,
        targets: { look: lookTargets, do: doList },
        stop: { triggerAction: stopId },
        finish: { triggerAction: finishId },
        costs: { wait: waitCost, blocked: blockedCost },
        costsAreEstimates,
        sourceDurations,
        realTimeline,
      };

      return scenario;
    },
  );

// ---------------------------------------------------------------------------
// actionArb
// ---------------------------------------------------------------------------

/**
 * Generates a valid Action for the given Scenario.
 * Picks uniformly from: look at any look target, do any do target, help, wait.
 */
export function actionArb(scenario: Scenario): fc.Arbitrary<Action> {
  const lookActions: Action[] = scenario.targets.look.map((t) => ({
    kind: 'look',
    target: t.id,
  }));
  const doActions: Action[] = scenario.targets.do.map((t) => ({
    kind: 'do',
    target: t.id,
  }));
  const fixedActions: Action[] = [{ kind: 'help' }, { kind: 'wait' }];
  const allActions: Action[] = [...lookActions, ...doActions, ...fixedActions];

  return fc.constantFrom(...allActions);
}

// ---------------------------------------------------------------------------
// actionSequenceArb
// ---------------------------------------------------------------------------

/**
 * Generates an array of up to `maxLen` valid actions for the given Scenario.
 * Each element is independently drawn from actionArb(scenario).
 */
export function actionSequenceArb(
  scenario: Scenario,
  maxLen: number,
): fc.Arbitrary<Action[]> {
  return fc.array(actionArb(scenario), { minLength: 0, maxLength: maxLen });
}
