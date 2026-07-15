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
 * each legacy hook with a plain-object copy of the new aggregate, so no hook
 * observes non-allowlisted data.
 *
 * @param hooks - the legacy hooks to preserve
 *
 * @beta
 */
export function createBeforeLogAdapter(
  hooks: readonly LegacyBeforeLogHook[]
): (aggregate: ITelemetryAggregate) => void {
  return (aggregate: ITelemetryAggregate): void => {
    const record: Record<string, unknown> = { ...aggregate };
    for (const hook of hooks) {
      hook(record);
    }
  };
}
