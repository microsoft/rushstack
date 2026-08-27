// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITelemetryAggregate } from './TelemetryAggregate';

/**
 * The legacy `beforeLog` telemetry hook signature.
 *
 * @remarks
 * Existing telemetry consumers register a `beforeLog` hook that runs with the
 * telemetry record before it is written. The hook receives a plain object.
 *
 * @beta
 */
export type LegacyBeforeLogHook = (telemetry: Record<string, unknown>) => void;

/**
 * Adapts the allowlisted telemetry aggregate to the legacy `beforeLog` hook.
 *
 * @remarks
 * During migration the existing `beforeLog` hook is preserved: the adapter runs
 * each legacy hook with an allowlisted summary projection matching Rush's
 * legacy `ITelemetryData` field names and units. Detailed operation records are
 * intentionally unavailable at this privacy boundary. No hook mutates the
 * allowlisted aggregate, and the returned record preserves hook augmentations
 * for the legacy telemetry writer.
 *
 * @param hooks - the legacy hooks to preserve
 *
 * @beta
 */
export function createBeforeLogAdapter(
  hooks: readonly LegacyBeforeLogHook[]
): (aggregate: ITelemetryAggregate) => Record<string, unknown> {
  return (aggregate: ITelemetryAggregate): Record<string, unknown> => {
    if (aggregate.commandName === undefined || aggregate.result === undefined) {
      throw new Error('A completed telemetry aggregate is required by the legacy beforeLog adapter.');
    }

    const counts: { readonly [status: string]: number } = aggregate.operationStatusCounts;
    const record: Record<string, unknown> = {
      name: aggregate.commandName,
      durationInSeconds: (aggregate.durationMs ?? 0) / 1000,
      result: aggregate.result === 'succeeded' ? 'Succeeded' : 'Failed',
      operationResults: {},
      extraData: {
        countAll: Object.values(counts).reduce((total: number, count: number) => total + count, 0),
        countSuccess: counts.success ?? 0,
        countSuccessWithWarnings: counts.successWithWarnings ?? 0,
        countFailure: counts.failure ?? 0,
        countBlocked: counts.blocked ?? 0,
        countFromCache: counts.fromCache ?? 0,
        countSkipped: counts.skipped ?? 0,
        countNoOp: counts.noOp ?? 0,
        countAborted: counts.aborted ?? 0
      }
    };
    for (const hook of hooks) {
      hook(record);
    }
    return record;
  };
}
