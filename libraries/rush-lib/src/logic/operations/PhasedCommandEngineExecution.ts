// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { LockFile } from '@rushstack/node-core-library';

import type { IPhasedCommandEngine } from '../../api/PhasedCommandEngine';
import { PhasedCommandEngineBusyError } from '../../api/PhasedCommandEngineBusyError';

/**
 * Owns the native process lock only while a host is reconciling or executing one graph iteration.
 */
export class PhasedCommandEngineExecution implements AsyncDisposable {
  private readonly _engine: IPhasedCommandEngine;
  private readonly _lockFolder: string;
  private _activeLeaseCompletion: Promise<void> | undefined;
  private _disposePromise: Promise<void> | undefined;
  private _disposing: boolean = false;
  private _releaseError: unknown;

  public constructor(engine: IPhasedCommandEngine, lockFolder: string) {
    this._engine = engine;
    this._lockFolder = lockFolder;
  }

  public async acquireExecutionLeaseAsync(): Promise<AsyncDisposable> {
    if (this._disposing) throw new Error('The native phased engine is being disposed.');
    if (this._releaseError !== undefined) throw this._releaseError;
    if (this._activeLeaseCompletion)
      throw new Error('The native phased engine already has an execution lease.');

    const lock: LockFile | undefined = LockFile.tryAcquire(this._lockFolder, 'rush');
    if (!lock) throw new PhasedCommandEngineBusyError();
    try {
      // Native CLI actions leave their process lock file behind on exit. Their work may have
      // changed ignored outputs, so do not trust the previous in-memory success records.
      if (lock.dirtyWhenAcquired) {
        this._engine.operationGraph.invalidateOperations(undefined, 'native-command-completed');
      }
    } catch (error) {
      lock.release();
      throw error;
    }

    let completeLease: () => void = () => undefined;
    this._activeLeaseCompletion = new Promise<void>((resolve) => {
      completeLease = resolve;
    });
    let releasePromise: Promise<void> | undefined;
    const releaseAsync: () => Promise<void> = async () => {
      try {
        lock.release();
      } catch (error) {
        this._releaseError = error;
        throw error;
      } finally {
        this._activeLeaseCompletion = undefined;
        completeLease();
      }
    };
    return { [Symbol.asyncDispose]: () => (releasePromise ??= releaseAsync()) };
  }

  public [Symbol.asyncDispose](): Promise<void> {
    this._disposing = true;
    this._disposePromise ??= this._disposeAsync();
    return this._disposePromise;
  }

  private async _disposeAsync(): Promise<void> {
    await this._activeLeaseCompletion;
    try {
      await this._engine[Symbol.asyncDispose]();
    } catch (error) {
      if (this._releaseError !== undefined) {
        throw new AggregateError(
          [this._releaseError, error],
          'Failed to release and dispose the native engine.'
        );
      }
      throw error;
    }
    if (this._releaseError !== undefined) throw this._releaseError;
  }
}
