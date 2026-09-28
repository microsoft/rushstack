// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Operation } from './Operation';
import type { IConfigurableOperation, IOperationExecutionResult } from './IOperationExecutionResult';
import { SUCCESS_STATUSES } from './OperationStatus';

const unverifiableResults: WeakSet<IOperationExecutionResult> = new WeakSet();

/**
 * Records that the outputs of a result of the executing iteration may not match its state hash, e.g. because input
 * files of the operation changed while the inputs snapshot was being taken or while the operation was executing.
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
 * Re-enables selected operations whose successful result retained by a previous iteration of a long-lived graph
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
 */
export function enableUnverifiedRetainedOperations(
  records: ReadonlyMap<Operation, IConfigurableOperation>,
  lastStates: ReadonlyMap<Operation, IOperationExecutionResult>,
  verifiedStateHashByOperation: ReadonlyMap<Operation, string>
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
          SUCCESS_STATUSES.has(lastState.status) &&
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
