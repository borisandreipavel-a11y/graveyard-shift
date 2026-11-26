import { describe, it, expect } from 'vitest';
import { ScenarioSchema, SignalSchema, LookTargetSchema, DoTargetSchema } from '../schema.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A valid minimal scenario that passes ScenarioSchema. All tests that mutate
 *  one field start from a deep clone of this object so they remain independent. */
function minimalScenario(): unknown {
  return {
    id: 'test-scenario',
    title: 'Test Scenario',
    source: {
      url: 'https://example.com/postmortem',
      title: 'Example postmortem',
    },
    reconstructionNote: 'Single-player reconstruction.',
    initialSignals: ['sig-page'],
    signals: [
      { id: 'sig-page', text: 'You are paged.', arrivesAtMinute: 0 },
    ],
    targets: {
      look: [
        { id: 'dashboard', name: 'the dashboard', description: 'All red.', cost: 1 },
      ],
      do: [
        {
          id: 'terminate',
          name: 'terminate the service',
          description: 'You terminate it.',
          cost: 1,
          outcome: { kind: 'delayed', effect: { delayMinutes: 1, text: 'Outage stops.', setsFlag: 'outage_stopped' } },
        },
        {
          id: 're-enable',
          name: 're-enable the service',
          description: 'You re-enable it.',
          cost: 1,
          requires: ['terminate'],
          outcome: { kind: 'finish' },
        },
      ],
    },
    stop: { triggerAction: 'terminate' },
    finish: { triggerAction: 're-enable' },
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

/** Deep-clone + patch helper so tests stay isolated. */
function patch(overrides: Record<string, unknown>): unknown {
  const base = minimalScenario() as Record<string, unknown>;
  return { ...base, ...overrides };
}

// ---------------------------------------------------------------------------
// Valid base object
// ---------------------------------------------------------------------------

describe('ScenarioSchema — valid object', () => {
  it('accepts a valid minimal scenario', () => {
    const result = ScenarioSchema.safeParse(minimalScenario());
    expect(result.success).toBe(true);
  });

  it('round-trips: parsed output re-parses cleanly', () => {
    const first = ScenarioSchema.safeParse(minimalScenario());
    expect(first.success).toBe(true);
    const second = ScenarioSchema.safeParse((first as { success: true; data: unknown }).data);
    expect(second.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Required top-level fields — missing → error
// ---------------------------------------------------------------------------

describe('ScenarioSchema — missing required fields', () => {
  const requiredTopLevel = [
    'id',
    'title',
    'source',
    'reconstructionNote',
    'initialSignals',
    'signals',
    'targets',
    'stop',
    'finish',
    'costs',
    'costsAreEstimates',
    'sourceDurations',
    'realTimeline',
  ] as const;

  for (const field of requiredTopLevel) {
    it(`rejects when '${field}' is missing`, () => {
      const obj = minimalScenario() as Record<string, unknown>;
      delete obj[field];
      const result = ScenarioSchema.safeParse(obj);
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths.some((p) => p === field || p.startsWith(field))).toBe(true);
      }
    });
  }

  it('rejects when source.url is missing', () => {
    const obj = minimalScenario() as Record<string, unknown>;
    obj.source = { title: 'Only title' };
    const result = ScenarioSchema.safeParse(obj);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p.includes('url'))).toBe(true);
    }
  });

  it('rejects when costs.wait is missing', () => {
    const obj = minimalScenario() as Record<string, unknown>;
    obj.costs = { blocked: 1 };
    const result = ScenarioSchema.safeParse(obj);
    expect(result.success).toBe(false);
  });

  it('rejects when costs.blocked is missing', () => {
    const obj = minimalScenario() as Record<string, unknown>;
    obj.costs = { wait: 1 };
    const result = ScenarioSchema.safeParse(obj);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Wrong types → error naming the field
// ---------------------------------------------------------------------------

describe('ScenarioSchema — wrong types', () => {
  it('rejects when id is a number', () => {
    const result = ScenarioSchema.safeParse(patch({ id: 42 }));
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p === 'id')).toBe(true);
    }
  });

  it('rejects when title is null', () => {
    const result = ScenarioSchema.safeParse(patch({ title: null }));
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p === 'title')).toBe(true);
    }
  });

  it('rejects when costsAreEstimates is a string', () => {
    const result = ScenarioSchema.safeParse(patch({ costsAreEstimates: 'yes' }));
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p === 'costsAreEstimates')).toBe(true);
    }
  });

  it('rejects when source.url is not a valid URL', () => {
    const obj = minimalScenario() as Record<string, unknown>;
    obj.source = { url: 'not-a-url', title: 'Example' };
    const result = ScenarioSchema.safeParse(obj);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p.includes('url'))).toBe(true);
    }
  });

  it('rejects when signals is not an array', () => {
    const result = ScenarioSchema.safeParse(patch({ signals: 'not-an-array' }));
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p === 'signals')).toBe(true);
    }
  });

  it('rejects when costs.wait is a string', () => {
    const obj = minimalScenario() as Record<string, unknown>;
    obj.costs = { wait: 'one', blocked: 1 };
    const result = ScenarioSchema.safeParse(obj);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p.includes('wait'))).toBe(true);
    }
  });

  it('rejects when realTimeline is not an array', () => {
    const result = ScenarioSchema.safeParse(patch({ realTimeline: {} }));
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Negative minutes → error (Requirement 1.5)
// ---------------------------------------------------------------------------

describe('ScenarioSchema — negative minutes rejected', () => {
  it('rejects a signal with arrivesAtMinute: -1', () => {
    const obj = minimalScenario() as Record<string, unknown>;
    obj.signals = [{ id: 'sig-page', text: 'Paged.', arrivesAtMinute: -1 }];
    const result = ScenarioSchema.safeParse(obj);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p.includes('arrivesAtMinute'))).toBe(true);
    }
  });

  it('rejects costs.wait: -5', () => {
    const obj = minimalScenario() as Record<string, unknown>;
    obj.costs = { wait: -5, blocked: 1 };
    const result = ScenarioSchema.safeParse(obj);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p.includes('wait'))).toBe(true);
    }
  });

  it('rejects costs.blocked: -1', () => {
    const obj = minimalScenario() as Record<string, unknown>;
    obj.costs = { wait: 1, blocked: -1 };
    const result = ScenarioSchema.safeParse(obj);
    expect(result.success).toBe(false);
  });

  it('rejects a do-target with cost: -3', () => {
    const result = DoTargetSchema.safeParse({
      id: 'act',
      name: 'do it',
      description: 'You do it.',
      cost: -3,
      outcome: { kind: 'reveals', text: 'revealed.' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts arrivesAtMinute: 0 (boundary)', () => {
    const obj = minimalScenario() as Record<string, unknown>;
    obj.signals = [{ id: 'sig-page', text: 'Paged.', arrivesAtMinute: 0 }];
    const result = ScenarioSchema.safeParse(obj);
    expect(result.success).toBe(true);
  });

  it('rejects sourceDurations with negative pageToIdentified', () => {
    const obj = minimalScenario() as Record<string, unknown>;
    obj.sourceDurations = {
      pageToIdentified: -1,
      pageToSwitchOff: 15,
      pageToRecovery: 20,
      switchOffToWafRestored: 30,
      outageFromDeploy: 40,
    };
    const result = ScenarioSchema.safeParse(obj);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SignalSchema
// ---------------------------------------------------------------------------

describe('SignalSchema', () => {
  it('accepts a signal without arrivesAtMinute', () => {
    const result = SignalSchema.safeParse({ id: 'sig-1', text: 'First alert.' });
    expect(result.success).toBe(true);
  });

  it('accepts reconstruction: true', () => {
    const result = SignalSchema.safeParse({ id: 'sig-2', text: 'Second.', arrivesAtMinute: 5, reconstruction: true });
    expect(result.success).toBe(true);
  });

  it('rejects empty id', () => {
    const result = SignalSchema.safeParse({ id: '', text: 'Text.' });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer arrivesAtMinute', () => {
    const result = SignalSchema.safeParse({ id: 'sig-3', text: 'Text.', arrivesAtMinute: 1.5 });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// LookTargetSchema
// ---------------------------------------------------------------------------

describe('LookTargetSchema', () => {
  it('accepts a valid look target', () => {
    const result = LookTargetSchema.safeParse({
      id: 'alert-list',
      name: 'the alert list',
      description: 'Many alerts.',
      cost: 1,
    });
    expect(result.success).toBe(true);
  });

  it('rejects cost: 2 (must be exactly 1)', () => {
    const result = LookTargetSchema.safeParse({
      id: 'alert-list',
      name: 'the alert list',
      description: 'Many alerts.',
      cost: 2,
    });
    expect(result.success).toBe(false);
  });

  it('rejects cost: 0', () => {
    const result = LookTargetSchema.safeParse({
      id: 'alert-list',
      name: 'the alert list',
      description: 'Many alerts.',
      cost: 0,
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional descriptionOnRepeat', () => {
    const result = LookTargetSchema.safeParse({
      id: 'alert-list',
      name: 'the alert list',
      description: 'Many alerts.',
      descriptionOnRepeat: 'Still many alerts.',
      cost: 1,
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DoTargetSchema — discriminated union outcomes
// ---------------------------------------------------------------------------

describe('DoTargetSchema — outcome kinds', () => {
  const base = {
    id: 'act',
    name: 'do the thing',
    description: 'You do it.',
    cost: 3,
  };

  it('accepts outcome kind: reveals', () => {
    expect(DoTargetSchema.safeParse({ ...base, outcome: { kind: 'reveals', text: 'You see something.' } }).success).toBe(true);
  });

  it('accepts outcome kind: dead-end', () => {
    expect(DoTargetSchema.safeParse({ ...base, outcome: { kind: 'dead-end', text: 'No luck.' } }).success).toBe(true);
  });

  it('accepts outcome kind: fails', () => {
    expect(DoTargetSchema.safeParse({ ...base, outcome: { kind: 'fails', text: 'It fails.' } }).success).toBe(true);
  });

  it('accepts outcome kind: progress', () => {
    expect(DoTargetSchema.safeParse({ ...base, outcome: { kind: 'progress', flag: 'p0-declared' } }).success).toBe(true);
  });

  it('accepts outcome kind: finish', () => {
    expect(DoTargetSchema.safeParse({ ...base, outcome: { kind: 'finish' } }).success).toBe(true);
  });

  it('accepts outcome kind: delayed', () => {
    expect(DoTargetSchema.safeParse({
      ...base,
      outcome: { kind: 'delayed', effect: { delayMinutes: 2, text: 'Recovery.', setsFlag: 'outage_stopped' } },
    }).success).toBe(true);
  });

  it('rejects unknown outcome kind', () => {
    expect(DoTargetSchema.safeParse({ ...base, outcome: { kind: 'explode' } }).success).toBe(false);
  });

  it('rejects delayed outcome with negative delayMinutes', () => {
    expect(DoTargetSchema.safeParse({
      ...base,
      outcome: { kind: 'delayed', effect: { delayMinutes: -1, text: 'Recovery.', setsFlag: 'outage_stopped' } },
    }).success).toBe(false);
  });

  it('rejects delayed outcome with unknown setsFlag', () => {
    expect(DoTargetSchema.safeParse({
      ...base,
      outcome: { kind: 'delayed', effect: { delayMinutes: 2, text: 'Recovery.', setsFlag: 'other_flag' } },
    }).success).toBe(false);
  });

  it('rejects reveals outcome with no text', () => {
    expect(DoTargetSchema.safeParse({ ...base, outcome: { kind: 'reveals' } }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Optional fields
// ---------------------------------------------------------------------------

describe('ScenarioSchema — optional fields', () => {
  it('accepts scenario without any optional fields', () => {
    // The minimal scenario already has no optional fields set.
    const result = ScenarioSchema.safeParse(minimalScenario());
    expect(result.success).toBe(true);
  });

  it('accepts reconstruction: true on a real-timeline entry', () => {
    const obj = minimalScenario() as Record<string, unknown>;
    obj.realTimeline = [
      { utcTimestamp: '13:45', description: 'First page.', reconstruction: true },
    ];
    const result = ScenarioSchema.safeParse(obj);
    expect(result.success).toBe(true);
  });
});
