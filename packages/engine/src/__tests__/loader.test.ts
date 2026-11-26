import { describe, it, expect } from 'vitest';
import { loadScenario } from '../loader.js';
import { mkScenario, doTarget, lookTarget } from './helpers.js';

// ---------------------------------------------------------------------------
// Helpers: build raw plain objects so we can test bad shapes before Zod
// ---------------------------------------------------------------------------

/** Serialize to a plain JS object (strips class instances, functions, etc.). */
function raw(s: unknown = mkScenario()): unknown {
  return JSON.parse(JSON.stringify(s));
}

function rawWith(overrides: Record<string, unknown>): unknown {
  const base = raw() as Record<string, unknown>;
  return { ...base, ...overrides };
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('loadScenario — valid scenario', () => {
  it('returns ok:true for a valid minimal scenario', () => {
    const result = loadScenario(raw());
    expect(result.ok).toBe(true);
  });

  it('round-trips: loadScenario on the parsed scenario returns ok:true again', () => {
    const first = loadScenario(raw());
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('unexpected');
    const second = loadScenario(first.scenario);
    expect(second.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Schema errors (Zod path reporting)
// ---------------------------------------------------------------------------

describe('loadScenario — schema errors name the field', () => {
  it('names the path when id is missing', () => {
    const obj = raw() as Record<string, unknown>;
    delete obj.id;
    const result = loadScenario(obj);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unexpected');
    expect(result.error.kind).toBe('schema');
    if (result.error.kind !== 'schema') throw new Error('unexpected');
    const paths = result.error.issues.map((i) => i.path);
    expect(paths.some((p) => p === 'id' || p.startsWith('id'))).toBe(true);
  });

  it('names the path when title is missing', () => {
    const obj = rawWith({ title: undefined });
    const result = loadScenario(obj);
    expect(result.ok).toBe(false);
    if (result.ok || result.error.kind !== 'schema') throw new Error('unexpected');
    const paths = result.error.issues.map((i) => i.path);
    expect(paths.some((p) => p === 'title' || p.startsWith('title'))).toBe(true);
  });

  it('states expected type when id is a number', () => {
    const result = loadScenario(rawWith({ id: 42 }));
    expect(result.ok).toBe(false);
    if (result.ok || result.error.kind !== 'schema') throw new Error('unexpected');
    const idIssue = result.error.issues.find((i) => i.path === 'id');
    expect(idIssue).toBeDefined();
  });

  it('reports path and expected type when costs.wait is a string', () => {
    const obj = raw() as Record<string, unknown>;
    obj.costs = { wait: 'one', blocked: 1 };
    const result = loadScenario(obj);
    expect(result.ok).toBe(false);
    if (result.ok || result.error.kind !== 'schema') throw new Error('unexpected');
    const paths = result.error.issues.map((i) => i.path);
    expect(paths.some((p) => p.includes('wait'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Negative trigger minute (Requirement 1.5)
// ---------------------------------------------------------------------------

describe('loadScenario — negative minute rejected', () => {
  it('rejects a signal with arrivesAtMinute: -1', () => {
    const obj = raw() as Record<string, unknown>;
    obj.signals = [{ id: 'sig-page', text: 'Paged.', arrivesAtMinute: -1 }];
    const result = loadScenario(obj);
    expect(result.ok).toBe(false);
    if (result.ok || result.error.kind !== 'schema') throw new Error('unexpected');
    const paths = result.error.issues.map((i) => i.path);
    expect(paths.some((p) => p.includes('arrivesAtMinute'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cross-reference errors (Requirement 1.4)
// ---------------------------------------------------------------------------

describe('loadScenario — cross-reference errors', () => {
  it('rejects when a do-target requires a non-existent id', () => {
    const scenario = mkScenario({
      do: [
        doTarget({ id: 'terminate', outcome: { kind: 'delayed', effect: { delayMinutes: 1, text: 'Done.', setsFlag: 'outage_stopped' } } }),
        doTarget({ id: 're-enable', requires: ['nonexistent'], outcome: { kind: 'finish' } }),
      ],
    });
    const result = loadScenario(raw(scenario));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unexpected');
    expect(result.error.kind).toBe('reference');
    if (result.error.kind !== 'reference') throw new Error('unexpected');
    expect(result.error.message).toContain('nonexistent');
  });

  it('rejects when stop.triggerAction is not a known do-target id', () => {
    const obj = raw() as Record<string, unknown>;
    obj.stop = { triggerAction: 'does-not-exist' };
    const result = loadScenario(obj);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unexpected');
    expect(result.error.kind).toBe('reference');
    if (result.error.kind !== 'reference') throw new Error('unexpected');
    expect(result.error.path).toBe('stop.triggerAction');
  });

  it('rejects when finish.triggerAction is not a known do-target id', () => {
    const obj = raw() as Record<string, unknown>;
    obj.finish = { triggerAction: 'does-not-exist' };
    const result = loadScenario(obj);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unexpected');
    expect(result.error.kind).toBe('reference');
    if (result.error.kind !== 'reference') throw new Error('unexpected');
    expect(result.error.path).toBe('finish.triggerAction');
  });

  it('rejects when a signal id is duplicated', () => {
    const obj = raw() as Record<string, unknown>;
    obj.signals = [
      { id: 'sig-page', text: 'First page.' },
      { id: 'sig-page', text: 'Duplicate.' },
    ];
    const result = loadScenario(obj);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unexpected');
    expect(result.error.kind).toBe('reference');
    if (result.error.kind !== 'reference') throw new Error('unexpected');
    expect(result.error.message).toContain('sig-page');
  });

  it('rejects when a look-target id is duplicated within targets.look', () => {
    const scenario = mkScenario({
      look: [lookTarget({ id: 'dashboard' }), lookTarget({ id: 'dashboard', name: 'the other dashboard' })],
    });
    const result = loadScenario(raw(scenario));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unexpected');
    expect(result.error.kind).toBe('reference');
    if (result.error.kind !== 'reference') throw new Error('unexpected');
    expect(result.error.path).toBe('targets.look[id=dashboard]');
    expect(result.error.message).toContain('dashboard');
  });

  it('rejects when a do-target id is duplicated within targets.do', () => {
    const scenario = mkScenario({
      do: [
        doTarget({ id: 'terminate', outcome: { kind: 'delayed', effect: { delayMinutes: 1, text: 'Stop.', setsFlag: 'outage_stopped' } } }),
        doTarget({ id: 'terminate', name: 'terminate it again', outcome: { kind: 'progress', flag: 'again' } }),
        doTarget({ id: 're-enable', requires: ['terminate'], outcome: { kind: 'finish' } }),
      ],
    });
    const result = loadScenario(raw(scenario));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unexpected');
    expect(result.error.kind).toBe('reference');
    if (result.error.kind !== 'reference') throw new Error('unexpected');
    expect(result.error.path).toBe('targets.do[id=terminate]');
    expect(result.error.message).toContain('terminate');
  });

  it('rejects when initialSignals references an undefined signal id', () => {
    const scenario = mkScenario();
    const obj = raw(scenario) as Record<string, unknown>;
    obj.initialSignals = ['sig-page', 'sig-ghost'];
    const result = loadScenario(obj);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unexpected');
    expect(result.error.kind).toBe('reference');
    if (result.error.kind !== 'reference') throw new Error('unexpected');
    expect(result.error.path).toBe('initialSignals');
    expect(result.error.message).toContain('sig-ghost');
  });

  it('rejects when a target id appears in both look and do lists', () => {
    const scenario = mkScenario({
      look: [lookTarget({ id: 'shared-id' })],
      do: [
        doTarget({ id: 'shared-id', outcome: { kind: 'delayed', effect: { delayMinutes: 1, text: 'Stop.', setsFlag: 'outage_stopped' } } }),
        doTarget({ id: 're-enable', requires: ['shared-id'], outcome: { kind: 'finish' } }),
      ],
    });
    const result = loadScenario(raw(scenario));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unexpected');
    expect(result.error.kind).toBe('reference');
    if (result.error.kind !== 'reference') throw new Error('unexpected');
    expect(result.error.message).toContain('shared-id');
  });
});

// ---------------------------------------------------------------------------
// Reachability (Requirement 2.2)
// ---------------------------------------------------------------------------

describe('loadScenario — unreachable scenario rejected', () => {
  it('rejects a scenario where the finish trigger has no path from start', () => {
    // 're-enable' requires 'other' which does not exist → unreachable via requires.
    // But we have to pass the cross-reference check first; use a valid requires id
    // that itself requires something impossible to satisfy.
    // Simplest: finish target requires the stop target, but stop target requires
    // some target X that requires stop target → cycle, but that creates a requires
    // reference loop which the cross-reference check doesn't reject (it only checks
    // id existence), so BFS terminates without reaching the accept state.
    const doList = [
      doTarget({
        id: 'terminate',
        requires: ['re-enable'], // circular — 're-enable' needs 'terminate' first too
        outcome: { kind: 'delayed', effect: { delayMinutes: 1, text: 'Stops.', setsFlag: 'outage_stopped' } },
      }),
      doTarget({
        id: 're-enable',
        requires: ['terminate'],
        outcome: { kind: 'finish' },
      }),
    ];
    const result = loadScenario(raw(mkScenario({ do: doList })));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unexpected');
    expect(result.error.kind).toBe('unreachable');
  });

  it('rejects a scenario where stop trigger outcome is not delayed', () => {
    // The reachability check rejects this because Outage_Stopped can never be set.
    const doList = [
      doTarget({
        id: 'terminate',
        outcome: { kind: 'progress', flag: 'terminated' }, // not delayed → stop never fires
      }),
      doTarget({
        id: 're-enable',
        requires: ['terminate'],
        outcome: { kind: 'finish' },
      }),
    ];
    const result = loadScenario(raw(mkScenario({ do: doList })));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unexpected');
    expect(result.error.kind).toBe('unreachable');
  });

  it('rejects a scenario where finish trigger outcome is not finish', () => {
    const doList = [
      doTarget({
        id: 'terminate',
        outcome: { kind: 'delayed', effect: { delayMinutes: 1, text: 'Stops.', setsFlag: 'outage_stopped' } },
      }),
      doTarget({
        id: 're-enable',
        requires: ['terminate'],
        outcome: { kind: 'progress', flag: 'done' }, // not finish → Incident_Finished never set
      }),
    ];
    const result = loadScenario(raw(mkScenario({ do: doList })));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unexpected');
    expect(result.error.kind).toBe('unreachable');
  });
});
