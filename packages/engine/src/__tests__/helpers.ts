// Shared test fixtures for engine tests. Not compiled into the package build.
import type { Scenario, DoTarget, LookTarget, Signal } from '../types.js';

export function lookTarget(overrides: Partial<LookTarget> = {}): LookTarget {
  return {
    id: 'dashboard',
    name: 'the dashboard',
    description: 'All red.',
    cost: 1,
    ...overrides,
  };
}

export function doTarget(overrides: Partial<DoTarget> & { id: string }): DoTarget {
  return {
    name: `do ${overrides.id}`,
    description: `You do ${overrides.id}.`,
    cost: 1,
    outcome: { kind: 'progress', flag: `${overrides.id}-done` },
    ...overrides,
  } as DoTarget;
}

export function signal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: 'sig-page',
    text: 'PAGERDUTY: outside WAF test failing.',
    arrivesAtMinute: 0,
    ...overrides,
  };
}

/** A scenario with a linear stop → finish chain by default. */
export function mkScenario(overrides: {
  look?: LookTarget[];
  do?: DoTarget[];
  signals?: Signal[];
  stop?: string;
  finish?: string;
} = {}): Scenario {
  const look = overrides.look ?? [lookTarget()];
  const doList = overrides.do ?? [
    doTarget({
      id: 'terminate',
      outcome: {
        kind: 'delayed',
        effect: { delayMinutes: 1, text: 'Outage stops.', setsFlag: 'outage_stopped' },
      },
    }),
    doTarget({
      id: 're-enable',
      requires: ['terminate'],
      outcome: { kind: 'finish' },
    }),
  ];
  return {
    id: 'test-scenario',
    title: 'Test Scenario',
    source: {
      url: 'https://example.com/postmortem',
      title: 'Example postmortem',
    },
    reconstructionNote: 'Single-player reconstruction.',
    initialSignals: ['sig-page'],
    signals: overrides.signals ?? [signal()],
    targets: { look, do: doList },
    stop: { triggerAction: overrides.stop ?? 'terminate' },
    finish: { triggerAction: overrides.finish ?? 're-enable' },
    costs: { wait: 1, blocked: 1 },
    costsAreEstimates: true,
    sourceDurations: {
      pageToIdentified: 10,
      pageToSwitchOff: 15,
      pageToRecovery: 20,
      switchOffToWafRestored: 30,
      outageFromDeploy: 40,
    },
    realTimeline: [
      { utcTimestamp: '00:00', description: 'Deployment.' },
      { utcTimestamp: '00:10', description: 'Page sent.', reconstruction: true },
    ],
  };
}
