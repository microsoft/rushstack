// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Operation } from './Operation';
import type { IConfigurableOperation, IOperationExecutionResult } from './IOperationExecutionResult';
import { type OperationStatus, SUCCESS_STATUSES } from './OperationStatus';

const unverifiableResults: WeakSet<IOperationExecutionResult> = new WeakSet();
const resultsWithCheckedInputFiles: WeakSet<IOperationExecutionResult> = new WeakSet();
const verifiedSkipStateHashByResult: WeakMap<IOperationExecutionResult, string> = new WeakMap();
const trustedStateHashByResult: WeakMap<IOperationExecutionResult, string> = new WeakMap();

/**
 * Records that the outputs of a result of the executing iteration may not match its state hash, e.g. because input
 * files of the operation changed after the inputs snapshot read them, until the operation had executed.
 * Such a result is never verified at its state hash, so a later iteration of a long-lived graph runs the operation
 * again, and the consumers that were built against its outputs, instead of skipping them.
 *
 * @remarks
 * Call this from an `afterExecuteOperationAsync` tap with the default stage. The taps that verify results use a
 * later stage.
 */
export function markResultUnverifiable(result: IOperationExecutionResult): void {
  unverifiableResults.add(result);
}

/**
 * Returns true if `markResultUnverifiable` was called for the result.
 */
export function isResultUnverifiable(result: IOperationExecutionResult): boolean {
  return unverifiableResults.has(result);
}

/**
 * The stage of the `beforeExecuteOperationAsync` taps that capture the state of the input files of an operation,
 * to check after it executes whether they changed. It is later than the taps that can return a status instead of
 * executing the operation (e.g. skip detection or a restore from the build cache), so that the input files of an
 * operation that does not execute are not read.
 */
export const CAPTURE_INPUT_FILES_STAGE: number = Number.MAX_SAFE_INTEGER - 1;

/**
 * Records that a plugin checks whether the input files of the operation change from the inputs snapshot of the
 * executing iteration until the operation has executed, and calls `markResultUnverifiable` for the result if they do,
 * so that `IncrementalExecutionGuardPlugin` does not check them as well.
 *
 * @remarks
 * Call this from a `beforeExecuteOperationAsync` tap with the stage `CAPTURE_INPUT_FILES_STAGE`.
 * `IncrementalExecutionGuardPlugin` reads it from a tap with a later stage.
 */
export function markInputFilesChecked(result: IOperationExecutionResult): void {
  resultsWithCheckedInputFiles.add(result);
}

/**
 * Returns true if `markInputFilesChecked` was called for the result.
 */
export function areInputFilesChecked(result: IOperationExecutionResult): boolean {
  return resultsWithCheckedInputFiles.has(result);
}

/**
 * Records that a plugin which reports the result as skipped verified that the outputs of the operation are exactly
 * those of its build cache entry at the given state hash, e.g. because they were restored from that entry or written
 * to it, and have not changed since. If that is the state hash of the result, `CacheableOperationPlugin` trusts the
 * skipped result as it trusts a result restored from the build cache, so it does not block the cache writes of the
 * consumers of the operation.
 *
 * @remarks
 * Call this from the `beforeExecuteOperationAsync` tap that returns `OperationStatus.Skipped` for the result.
 */
export function markSkipVerified(result: IOperationExecutionResult, stateHash: string): void {
  verifiedSkipStateHashByResult.set(result, stateHash);
}

/**
 * Returns the state hash that was passed to `markSkipVerified` for the result, if any.
 */
export function getVerifiedSkipStateHash(result: IOperationExecutionResult): string | undefined {
  return verifiedSkipStateHashByResult.get(result);
}

/**
 * Records the state hash at which `CacheableOperationPlugin` trusts the result of the executing iteration as a
 * complete result that the build cache entries of consumers may be written against.
 *
 * @remarks
 * Only `CacheableOperationPlugin` calls this.
 */
export function setTrustedStateHash(result: IOperationExecutionResult, stateHash: string): void {
  trustedStateHashByResult.set(result, stateHash);
}

/**
 * Returns the state hash at which `CacheableOperationPlugin` trusted the result in the executing iteration as a
 * complete result that the build cache entries of consumers may be written against: its outputs were produced,
 * restored from the build cache, or verified by the plugin that skipped it, while cache writes were allowed for the
 * operation, and they are not the outputs of an incremental command. Returns undefined otherwise, including for a
 * result that a previous iteration of a long-lived graph retained.
 *
 * @remarks
 * Call this from an `afterExecuteOperationAsync` tap with a stage greater than 0, which runs after
 * `CacheableOperationPlugin` decided whether to trust the result.
 */
export function getTrustedStateHash(result: IOperationExecutionResult): string | undefined {
  return trustedStateHashByResult.get(result);
}

/**
 * Re-enables selected operations whose result retained by a previous iteration of a long-lived graph
 * (e.g. the Rush daemon) is current by state hash, but not verified at that state hash, so that they are restored
 * from the build cache or executed instead of being skipped. Such a result was produced while the outputs of one
 * of its dependencies were not verified (e.g. that dependency was not selected and had changed), so its outputs
 * may not match its state hash. Skipping it would keep outputs that were built against dependency outputs that
 * have since been rebuilt.
 *
 * An operation is only re-enabled if none of its dependencies will remain unverified, since otherwise running it
 * again would not produce a verified result either. An operation that is disabled for another reason than a
 * current retained result, e.g. by a plugin that performs the work itself, is left disabled.
 *
 * @param records - The records of the iteration that is being configured
 * @param lastStates - The results retained by previous iterations of the graph
 * @param verifiedStateHashByOperation - The state hash at which the retained result of each operation is verified
 * @param retainedResultStatuses - The statuses of retained results that running the operation again can verify
 */
export function enableUnverifiedRetainedOperations(
  records: ReadonlyMap<Operation, IConfigurableOperation>,
  lastStates: ReadonlyMap<Operation, IOperationExecutionResult>,
  verifiedStateHashByOperation: ReadonlyMap<Operation, string>,
  retainedResultStatuses: ReadonlySet<OperationStatus> = SUCCESS_STATUSES
): void {
  // Whether the result of each operation will still be unverified at the end of this iteration.
  const remainsUnverifiedByOperation: Map<Operation, boolean> = new Map();

  function remainsUnverified(operation: Operation): boolean {
    const known: boolean | undefined = remainsUnverifiedByOperation.get(operation);
    if (known !== undefined) {
      return known;
    }
    // Treat a dependency cycle as unverified; the real value is assigned below.
    remainsUnverifiedByOperation.set(operation, true);

    let unverified: boolean = false;
    for (const dependency of operation.dependencies) {
      if (remainsUnverified(dependency)) {
        unverified = true;
        break;
      }
    }

    const record: IConfigurableOperation | undefined = records.get(operation);
    if (!record) {
      unverified = true;
    } else if (!unverified && !record.enabled && !operation.isNoOp) {
      // The operation will be skipped, which only keeps a verified result if it is verified at this state hash.
      const stateHash: string = record.getStateHash();
      if (verifiedStateHashByOperation.get(operation) !== stateHash) {
        const lastState: IOperationExecutionResult | undefined = lastStates.get(operation);
        if (
          operation.enabled === true &&
          lastState &&
          retainedResultStatuses.has(lastState.status) &&
          lastState.getStateHash() === stateHash
        ) {
          record.enabled = true;
        } else {
          unverified = true;
        }
      }
    }

    remainsUnverifiedByOperation.set(operation, unverified);
    return unverified;
  }

  for (const operation of records.keys()) {
    remainsUnverified(operation);
  }
}
