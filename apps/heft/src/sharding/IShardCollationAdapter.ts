// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IShardCollationRequest, IShardCollationResult } from './ShardCollation';

/**
 * The explicit source-task address and cancellation state for one collation.
 * @public
 */
export interface IShardCollationContext extends IShardCollationRequest {
  /** Cancellation must not skip cleanup of this task's reports. */
  abortSignal: AbortSignal;
}

/**
 * Final workload diagnostics. Infrastructure failures must throw instead of returning a verdict.
 * @public
 */
export interface IShardCollationVerdict {
  /** A safe diagnostic count that may not be less than the validated manifest total. */
  diagnosticCount: number;
}

/**
 * One report lifecycle, bound to its source-task address and deterministic destinations.
 * Methods must reject use after release.
 * @public
 */
export interface IShardCollationSession {
  /**
   * Validate destination safety, then invalidate previous reports before any input validation.
   * Also used after unsuccessful collation, including with an aborted signal, to remove a report
   * published immediately before cancellation. Cleanup must not be skipped on cancellation.
   * Never remove shard inputs, other tasks' outputs, or the shard parent folder.
   */
  prepareAsync(): Promise<void>;
  /**
   * Validate opaque payloads, merge, publish reports atomically, and render workload diagnostics.
   * Throw on infrastructure errors. Return workload failures as diagnostics; the neutral task
   * owns the final failure verdict. All writes must settle before this method returns or throws.
   */
  collateAsync(result: IShardCollationResult): Promise<IShardCollationVerdict>;
  /**
   * Synchronously release resources after publication and cancellation cleanup have settled.
   * No asynchronous work may remain after release.
   */
  release(): void;
}

/**
 * One workload's report lifecycle, registered during plugin apply using
 * {@link IHeftTaskSession.registerShardCollator}.
 * @public
 */
export interface IShardCollationAdapter {
  /**
   * Open a report lifecycle without invalidating reports. Destinations and staging names must
   * be deterministic. The orchestrator schedules one writer per task and must not overlap
   * writers, cleaning, or collation; this API does not acquire filesystem locks.
   * Cancellation must not skip preparation of a previous report.
   */
  acquireAsync(context: IShardCollationContext): Promise<IShardCollationSession>;
}
