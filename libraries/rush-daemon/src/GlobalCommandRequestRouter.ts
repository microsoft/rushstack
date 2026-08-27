// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonCommandResult } from '@rushstack/rush-daemon-protocol';

import { createGlobalCommandResult } from './CommandResultPolicy';
import type { IGlobalCommandExecutionContext } from './GlobalCommandExecutionContext';
import { GlobalCommandExecutionContext } from './GlobalCommandExecutionContext';
import {
  type IResolvedGlobalCommandRequest,
  type IResolveGlobalCommandRequestOptions,
  resolveGlobalCommandRequest,
  validateResolvedGlobalCommandRequest
} from './GlobalCommandRequest';
import type { IGlobalCommandRequestClient } from './GlobalCommandRequestClient';
import type { IWorkspaceSession } from './WorkspaceSession';

/**
 * Executes caller-resolved global command logic.
 *
 * @remarks
 * The executor must observe `context.abortSignal` and settle before cancellation can complete. This preserves the
 * invariant that no caller-owned command logic remains active after the request context is cleaned up.
 *
 * @beta
 */
export type GlobalCommandExecutor = (
  context: IGlobalCommandExecutionContext
) => Promise<IGlobalCommandExecutionResult>;

/**
 * The process result returned by caller-owned global command logic.
 *
 * @beta
 */
export interface IGlobalCommandExecutionResult {
  readonly exitCode: number;
}

/**
 * The completion state for one global command request.
 *
 * @beta
 */
export type IGlobalCommandRequestResult = IDaemonCommandResult;

/**
 * Routes caller-owned global command logic through isolated per-request process and terminal context.
 *
 * @remarks
 * Command parsing and Rush action construction remain integration-owned. This router intentionally does not invoke
 * existing Rush actions that still depend on process-global cwd, environment, or console state.
 *
 * @beta
 */
export class GlobalCommandRequestRouter {
  readonly #workspaceSession: IWorkspaceSession;

  public constructor(workspaceSession: IWorkspaceSession) {
    this.#workspaceSession = workspaceSession;
  }

  /** Validates and snapshots an untrusted global request for this workspace. */
  public resolveRequest(options: IResolveGlobalCommandRequestOptions): IResolvedGlobalCommandRequest {
    return resolveGlobalCommandRequest(options, this.#workspaceSession);
  }

  /** Executes an already resolved global request without mutating daemon process globals. */
  public async executeAsync(
    request: IResolvedGlobalCommandRequest,
    executor: GlobalCommandExecutor,
    client: IGlobalCommandRequestClient
  ): Promise<IGlobalCommandRequestResult> {
    validateResolvedGlobalCommandRequest(request, this.#workspaceSession);
    const context: GlobalCommandExecutionContext = new GlobalCommandExecutionContext(
      request,
      client,
      this.#workspaceSession
    );
    let executionError: unknown;
    let executionResult: IGlobalCommandExecutionResult | undefined;
    let aborted: boolean = context.abortSignal.aborted;
    try {
      if (!aborted) {
        const executorPromise: Promise<IGlobalCommandExecutionResult> = Promise.resolve().then(() =>
          executor(context)
        );
        const outcome: 'aborted' | 'completed' = await waitForExecutionAsync(
          executorPromise,
          context.abortSignal
        );
        aborted = outcome === 'aborted';
        executionResult = await executorPromise;
      }
    } catch (error) {
      executionError = error;
      aborted = context.abortSignal.aborted;
    }

    let cleanupError: unknown;
    try {
      await context[Symbol.asyncDispose]();
    } catch (error) {
      cleanupError = error;
    }
    aborted ||= context.requestAborted;
    const combinedError: unknown = combineExecutionAndCleanupErrors(executionError, cleanupError);
    let result: IDaemonCommandResult;
    try {
      result = createGlobalCommandResult({
        aborted,
        error: combinedError,
        exitCode: executionResult?.exitCode,
        requestId: request.requestId
      });
    } catch (error) {
      result = createGlobalCommandResult({
        aborted: false,
        error,
        exitCode: undefined,
        requestId: request.requestId
      });
    }
    await client.writeResultAsync(result);
    return result;
  }
}

async function waitForExecutionAsync(
  executorPromise: Promise<IGlobalCommandExecutionResult>,
  abortSignal: AbortSignal
): Promise<'aborted' | 'completed'> {
  let removeAbortListener: (() => void) | undefined;
  const abortPromise: Promise<'aborted'> = new Promise((resolve) => {
    const onAbort = (): void => resolve('aborted');
    removeAbortListener = () => abortSignal.removeEventListener('abort', onAbort);
    if (abortSignal.aborted) {
      resolve('aborted');
    } else {
      abortSignal.addEventListener('abort', onAbort, { once: true });
    }
  });
  const completedPromise: Promise<'completed'> = executorPromise.then(() => 'completed');
  try {
    const outcome: 'aborted' | 'completed' = await Promise.race([completedPromise, abortPromise]);
    if (outcome === 'aborted') {
      await executorPromise;
    }
    return outcome;
  } finally {
    removeAbortListener?.();
    void executorPromise.catch(() => undefined);
  }
}

function combineExecutionAndCleanupErrors(executionError: unknown, cleanupError: unknown): unknown {
  if (executionError !== undefined && cleanupError !== undefined) {
    return new AggregateError(
      [executionError, cleanupError],
      'The global command failed and could not clean up its request context.'
    );
  }
  if (executionError !== undefined) {
    return executionError;
  }
  if (cleanupError !== undefined) {
    return cleanupError;
  }
  return undefined;
}
