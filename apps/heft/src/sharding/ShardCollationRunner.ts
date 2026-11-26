// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  IShardCollationAdapter,
  IShardCollationContext,
  IShardCollationSession,
  IShardCollationVerdict
} from './IShardCollationAdapter';
import {
  loadShardResultsAsync,
  type IShardCollationRequest,
  type IShardCollationResult
} from './ShardCollation';
import { validateShardPath } from './ShardFileSystem';

/**
 * Raw task context. Missing arguments are rejected after previous reports are invalidated.
 * @public
 */
export interface IShardCollationRunOptions extends IShardCollationRequest {
  /** Absolute build root against which input paths are validated. */
  buildFolderPath: string;
  /**
   * Transfer ownership to an outer task boundary. The callback must not throw.
   * The caller must release in finally, after its final cancellation check and report cleanup
   * on outer completion failure. Omit for a self-contained run.
   */
  onSessionAcquired?: (session: IShardCollationSession) => void;
}

/**
 * Runs an adapter's report lifecycle using neutral manifest validation.
 * Workload failures retain their completed report; infrastructure and cancellation failures
 * after publication invalidate it again.
 * @public
 */
export async function collateShardsAsync(
  options: IShardCollationRunOptions,
  adapter: IShardCollationAdapter,
  abortSignal: AbortSignal
): Promise<IShardCollationVerdict> {
  const {
    buildFolderPath,
    shardParentFolderPath,
    shardFolderNameTemplate,
    shardCount,
    producerPhaseName,
    producerTaskName
  } = options;
  const context: IShardCollationContext = {
    shardParentFolderPath,
    shardFolderNameTemplate,
    shardCount,
    producerPhaseName,
    producerTaskName,
    abortSignal
  };
  const session: IShardCollationSession = await adapter.acquireAsync(context);
  let transferred: boolean = false;
  const errors: unknown[] = [];
  try {
    if (options.onSessionAcquired) {
      options.onSessionAcquired(session);
      transferred = true;
    }
    await session.prepareAsync();
    abortSignal.throwIfAborted();
    validateShardPath(buildFolderPath, shardParentFolderPath);
    abortSignal.throwIfAborted();
    const result: IShardCollationResult = await loadShardResultsAsync(context, abortSignal);
    abortSignal.throwIfAborted();
    try {
      const verdict: IShardCollationVerdict = await session.collateAsync(result);
      abortSignal.throwIfAborted();
      if (
        !Number.isSafeInteger(verdict.diagnosticCount) ||
        verdict.diagnosticCount < result.diagnosticCount
      ) {
        throw new Error(
          'An adapter verdict must have a safe diagnostic count at least as large as the manifest total.'
        );
      }
      return verdict;
    } catch (error) {
      try {
        await session.prepareAsync();
      } catch (cleanupError) {
        throw createShardCollationError(
          [error, cleanupError],
          'Shard collation and report cleanup both failed.'
        );
      }
      throw error;
    }
  } catch (error) {
    errors.push(error);
    throw error;
  } finally {
    if (!transferred) releaseShardCollationSession(session, errors);
  }
}

/**
 * Releases ownership without replacing a pending collation failure.
 * @internal
 */
export function releaseShardCollationSession(
  session: IShardCollationSession,
  errors: readonly unknown[]
): void {
  try {
    session.release();
  } catch (releaseError) {
    if (errors.length > 0) {
      throw createShardCollationError(
        [...errors, releaseError],
        'Shard collation and ownership release both failed.'
      );
    }
    throw releaseError;
  }
}

/**
 * Keeps constituent diagnostics visible to loggers that render only Error.message.
 * @internal
 */
export function createShardCollationError(errors: readonly unknown[], message: string): AggregateError {
  const messages: string[] = [message];
  const pending: unknown[] = [...errors].reverse();
  const visited: Set<unknown> = new Set();
  while (pending.length > 0) {
    const error: unknown = pending.pop();
    if (visited.has(error)) continue;
    visited.add(error);
    messages.push(`  - ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof AggregateError) {
      for (let index: number = error.errors.length - 1; index >= 0; index--) {
        pending.push(error.errors[index]);
      }
    }
  }
  return new AggregateError(errors, messages.join('\n'));
}
