// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { LockFile } from '@rushstack/node-core-library';

import type { IPhasedCommandEngine } from '../../api/PhasedCommandEngine';
import { PhasedCommandEngineBusyError } from '../../api/PhasedCommandEngineBusyError';
import { NATIVE_COMMAND_INVALIDATION_REASON } from './IncrementalExecutionState';

/**
 * Owns the native process lock only while a host is reconciling or executing one graph iteration.
 */
export class PhasedCommandEngineExecution implements AsyncDisposable {
  readonly #engine: IPhasedCommandEngine;
  readonly #lockFolder: string;
  #activeLeaseCompletion: Promise<void> | undefined;
  #disposePromise: Promise<void> | undefined;
  #disposing: boolean = false;
  #releaseError: unknown;

  public constructor(engine: IPhasedCommandEngine, lockFolder: string) {
    this.#engine = engine;
    this.#lockFolder = lockFolder;
  }

  public async acquireExecutionLeaseAsync(): Promise<AsyncDisposable> {
    if (this.#disposing) throw new Error('The native phased engine is being disposed.');
    if (this.#releaseError !== undefined) throw this.#releaseError;
    if (this.#activeLeaseCompletion)
      throw new Error('The native phased engine already has an execution lease.');

    const lock: LockFile | undefined = LockFile.tryAcquire(this.#lockFolder, 'rush');
    if (!lock) throw new PhasedCommandEngineBusyError();
    try {
      // Native CLI actions leave their process lock file behind on exit. Their work may have
      // changed ignored outputs, so do not trust the previous in-memory success records.
      if (lock.dirtyWhenAcquired) {
        this.#engine.operationGraph.invalidateOperations(undefined, NATIVE_COMMAND_INVALIDATION_REASON);
      }
    } catch (error) {
      lock.release();
      throw error;
    }

    let completeLease: () => void = () => undefined;
    this.#activeLeaseCompletion = new Promise<void>((resolve) => {
      completeLease = resolve;
    });
    let releasePromise: Promise<void> | undefined;
    const releaseAsync: () => Promise<void> = async () => {
      try {
        lock.release();
      } catch (error) {
        this.#releaseError = error;
        throw error;
      } finally {
        this.#activeLeaseCompletion = undefined;
        completeLease();
      }
    };
    return { [Symbol.asyncDispose]: () => (releasePromise ??= releaseAsync()) };
  }

  public [Symbol.asyncDispose](): Promise<void> {
    this.#disposing = true;
    this.#disposePromise ??= this.#disposeAsync();
    return this.#disposePromise;
  }

  async #disposeAsync(): Promise<void> {
    await this.#activeLeaseCompletion;
    try {
      await this.#engine[Symbol.asyncDispose]();
    } catch (error) {
      if (this.#releaseError !== undefined) {
        throw new AggregateError(
          [this.#releaseError, error],
          'Failed to release and dispose the native engine.'
        );
      }
      throw error;
    }
    if (this.#releaseError !== undefined) throw this.#releaseError;
  }
}
