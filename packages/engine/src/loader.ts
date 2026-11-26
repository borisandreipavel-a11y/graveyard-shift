// Loader for scenario objects.
// Accepts an already-parsed plain in-memory object (never reads files),
// validates it against the Zod schema, runs cross-reference checks, then
// runs the Reachability_Check.
//
// All failures are returned as typed LoadResult values; this module throws
// nothing.

import type { ZodIssue } from 'zod';
import { ScenarioSchema } from './schema.js';
import type { LoadResult, SchemaIssue } from './types.js';
import { reachabilityCheck } from './reachability.js';

// ---------------------------------------------------------------------------
// Zod issue → SchemaIssue adapter
// ---------------------------------------------------------------------------

function zodIssueToSchemaIssue(issue: ZodIssue): SchemaIssue {
  const path = issue.path.join('.');

  // Zod v3 issues carry `expected` on invalid_type issues.
  // We cast to access it safely regardless of issue variant.
  const anyIssue = issue as ZodIssue & { expected?: string };
  const expected: string | undefined = typeof anyIssue.expected === 'string'
    ? anyIssue.expected
    : undefined;

  return {
    path,
    code: issue.code,
    expected,
    message: issue.message,
  };
}

// ---------------------------------------------------------------------------
// loadScenario
// ---------------------------------------------------------------------------

/**
 * Validate `obj` against the scenario Zod schema, run cross-reference checks,
 * then run the Reachability_Check.
 *
 * Returns `{ ok: true, scenario }` on success or `{ ok: false, error }` on
 * any failure. Never throws.
 */
export function loadScenario(obj: unknown): LoadResult {
  // --- Step 1: Zod schema validation ---
  const parsed = ScenarioSchema.safeParse(obj);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        kind: 'schema',
        issues: parsed.error.issues.map(zodIssueToSchemaIssue),
      },
    };
  }

  const scenario = parsed.data;

  // --- Step 2: Cross-reference checks ---

  // 2a. Look-target ids must be unique within targets.look.
  const lookIdsSeen = new Set<string>();
  for (const target of scenario.targets.look) {
    if (lookIdsSeen.has(target.id)) {
      return {
        ok: false,
        error: {
          kind: 'reference',
          path: `targets.look[id=${target.id}]`,
          message: `Duplicate look-target id '${target.id}'.`,
        },
      };
    }
    lookIdsSeen.add(target.id);
  }

  // 2b. Do-target ids must be unique within targets.do.
  const doIdsSeen = new Set<string>();
  for (const target of scenario.targets.do) {
    if (doIdsSeen.has(target.id)) {
      return {
        ok: false,
        error: {
          kind: 'reference',
          path: `targets.do[id=${target.id}]`,
          message: `Duplicate do-target id '${target.id}'.`,
        },
      };
    }
    doIdsSeen.add(target.id);
  }

  // Build id sets for the remaining checks (duplicates already rejected above).
  const doIds = doIdsSeen;
  const lookIds = lookIdsSeen;

  // 2c. No id may appear in both look and do lists (Requirement 12.5).
  for (const id of doIds) {
    if (lookIds.has(id)) {
      return {
        ok: false,
        error: {
          kind: 'reference',
          path: `targets.do[id=${id}]`,
          message: `Target id '${id}' appears in both targets.look and targets.do.`,
        },
      };
    }
  }

  // 2d. Signal ids must be unique.
  const signalIds = new Set<string>();
  for (const signal of scenario.signals) {
    if (signalIds.has(signal.id)) {
      return {
        ok: false,
        error: {
          kind: 'reference',
          path: `signals[id=${signal.id}]`,
          message: `Duplicate signal id '${signal.id}'.`,
        },
      };
    }
    signalIds.add(signal.id);
  }

  // 2e. Every initialSignals entry must reference a defined signal id.
  for (const sigId of scenario.initialSignals) {
    if (!signalIds.has(sigId)) {
      return {
        ok: false,
        error: {
          kind: 'reference',
          path: 'initialSignals',
          message: `initialSignals references unknown signal id '${sigId}'.`,
        },
      };
    }
  }

  // 2f. Every DoTarget.requires id must exist in targets.do.
  for (const target of scenario.targets.do) {
    for (const reqId of target.requires ?? []) {
      if (!doIds.has(reqId)) {
        return {
          ok: false,
          error: {
            kind: 'reference',
            path: `targets.do[id=${target.id}].requires`,
            message: `Unresolved requires id '${reqId}' on do-target '${target.id}'.`,
          },
        };
      }
    }
  }

  // 2g. stop.triggerAction must exist in targets.do.
  if (!doIds.has(scenario.stop.triggerAction)) {
    return {
      ok: false,
      error: {
        kind: 'reference',
        path: 'stop.triggerAction',
        message: `stop.triggerAction '${scenario.stop.triggerAction}' is not a known do-target id.`,
      },
    };
  }

  // 2h. finish.triggerAction must exist in targets.do.
  if (!doIds.has(scenario.finish.triggerAction)) {
    return {
      ok: false,
      error: {
        kind: 'reference',
        path: 'finish.triggerAction',
        message: `finish.triggerAction '${scenario.finish.triggerAction}' is not a known do-target id.`,
      },
    };
  }

  // --- Step 3: Reachability_Check (Requirement 2.1 / 2.2) ---
  if (!reachabilityCheck(scenario)) {
    return {
      ok: false,
      error: { kind: 'unreachable' },
    };
  }

  return { ok: true, scenario };
}
