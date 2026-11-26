// Zod schema for scenario objects.
// The engine never reads files; it only validates an already-parsed in-memory object.
// Types are inferred from the schema so the type definitions in types.ts
// and the runtime validation stay in sync.

import { z } from 'zod';

// --- Sub-schemas ---

export const SignalSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  /**
   * undefined means the signal is present from clock 0 (arrivesAtMinute not set).
   * When present, must be a non-negative integer (Requirement 1.5).
   */
  arrivesAtMinute: z.number().int().min(0).optional(),
  reconstruction: z.boolean().optional(),
});

export const LookTargetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  descriptionOnRepeat: z.string().min(1).optional(),
  /**
   * Cost is always exactly 1 minute for look targets.
   * z.literal(1) is intentionally used so schema tests can verify the
   * constraint fires on other values.
   */
  cost: z.literal(1),
  reconstruction: z.boolean().optional(),
});

export const DelayedEffectSpecSchema = z.object({
  delayMinutes: z.number().int().min(0),
  text: z.string().min(1),
  setsFlag: z.literal('outage_stopped'),
});

export const DoTargetOutcomeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('reveals'), text: z.string().min(1) }),
  z.object({ kind: z.literal('dead-end'), text: z.string().min(1) }),
  z.object({ kind: z.literal('fails'), text: z.string().min(1) }),
  z.object({ kind: z.literal('delayed'), effect: DelayedEffectSpecSchema }),
  z.object({ kind: z.literal('progress'), flag: z.string().min(1) }),
  z.object({ kind: z.literal('finish') }),
]);

export const DoTargetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  cost: z.number().int().min(0),
  requires: z.array(z.string().min(1)).optional(),
  outcome: DoTargetOutcomeSchema,
  reconstruction: z.boolean().optional(),
});

export const RealTimelineEntrySchema = z.object({
  utcTimestamp: z.string().min(1),
  description: z.string().min(1),
  reconstruction: z.boolean().optional(),
});

// --- Root scenario schema ---

export const ScenarioSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  source: z.object({
    url: z.string().url(),
    title: z.string().min(1),
  }),
  reconstructionNote: z.string().min(1),
  initialSignals: z.array(z.string().min(1)),
  signals: z.array(SignalSchema),
  targets: z.object({
    look: z.array(LookTargetSchema),
    do: z.array(DoTargetSchema),
  }),
  stop: z.object({
    triggerAction: z.string().min(1),
  }),
  finish: z.object({
    triggerAction: z.string().min(1),
  }),
  costs: z.object({
    wait: z.number().int().min(0),
    blocked: z.number().int().min(0),
  }),
  costsAreEstimates: z.boolean(),
  sourceDurations: z.object({
    pageToIdentified: z.number().int().min(0),
    pageToSwitchOff: z.number().int().min(0),
    pageToRecovery: z.number().int().min(0),
    switchOffToWafRestored: z.number().int().min(0),
    outageFromDeploy: z.number().int().min(0),
  }),
  realTimeline: z.array(RealTimelineEntrySchema),
});

// Infer the Scenario type from the schema so type definitions stay in sync.
export type Scenario = z.infer<typeof ScenarioSchema>;
