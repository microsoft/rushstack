// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { Worker } from 'worker_threads';
import {
  IRushWorkerBuildMessage,
  IRushWorkerResponse,
  IRushWorkerShutdownMessage,
  ITransferableOperation,
  ITransferableOperationStatus,
  PhasedCommandWorkerState
} from './RushWorker.types';

/**
 * @alpha
 */
export interface IPhasedCommandWorkerOptions {
  /**
   * The working directory
   */
  cwd?: string;

  /**
   * Status update callback
   */
  onStatusUpdate?: (operationStatus: ITransferableOperationStatus) => void;

  /**
   * Callback invoked when worker state changes
   */
  onStateChanged?: (state: PhasedCommandWorkerState) => void;
}

const abortMessage: IRushWorkerBuildMessage = {
  type: 'build',
  value: { targets: [] }
};

const shutdownMessage: IRushWorkerShutdownMessage = {
  type: 'shutdown',
  value: {}
};

interface ISignal<T> {
  resolve: (value: T) => void;
  promise: Promise<T>;
}

function createSignal<T>(beforeResolve?: (value: T) => void): ISignal<T> {
  let outerResolve!: (value: T) => void;
  const promise: Promise<T> = new Promise<T>((resolve) => {
    outerResolve = (value: T) => {
      beforeResolve?.(value);
      resolve(value);
    };
  });
  return { resolve: outerResolve, promise } as ISignal<T>;
}

/**
 * Interface for controlling a phased command worker. The worker internally tracks the most recent state of the underlying command,
 * so that each call to `updateAsync` only needs to perform operations for which the last inputs are stale.
 * @alpha
 */
export class PhasedCommandWorkerController {
  /**
   * Overrideable, event handler for when the worker state changes
   */
  public onStateChanged: (state: PhasedCommandWorkerState) => void;
  /**
   * Overrideable, event handler for operation status changes.
   */
  public onStatusUpdate: (operationStatus: ITransferableOperationStatus) => void;

  private readonly _worker: Worker;
  private _state: PhasedCommandWorkerState;

  private readonly _statusByOperation: Map<string, ITransferableOperationStatus>;

  private readonly _exitSignal: ISignal<void>;
  private readonly _graphSignal: ISignal<ITransferableOperation[]>;

  private _readySignal: ISignal<void>;

  private _activeGraphSignal: ISignal<ITransferableOperationStatus[]>;

  /**
   * Creates a Worker than runs the phased commands indicated by `args`, e.g. `build --production`.
   * Do not pass selection parameters (--to, --from, etc.), as scoping is handled later.
   *
   * @param args - The command line arguments for the worker, including the command name and any parameters.
   * @param options - Configuration for the worker
   *
   * @alpha
   */
  public constructor(args: string[], options?: IPhasedCommandWorkerOptions) {
    const {
      cwd,
      onStatusUpdate = () => {
        // Noop
      },
      onStateChanged = () => {
        // Noop
      }
    } = options ?? {};

    this._state = 'initializing';
    this._statusByOperation = new Map();

    this._graphSignal = createSignal();

    this._exitSignal = createSignal(() => {
      this._updateState('exited');
    });

    this._readySignal = createSignal(() => {
      this._updateState('waiting');
    });

    this._activeGraphSignal = createSignal();

    this.onStatusUpdate = onStatusUpdate;
    this.onStateChanged = onStateChanged;

    const workerPath: string = path.resolve(__dirname, 'RushWorkerEntry.js');
    const worker: Worker = new Worker(workerPath, {
      workerData: {
        argv: args,
        cwd
      },
      stdout: true
    });
    worker.on('exit', this._exitSignal.resolve);
    this._worker = worker;

    worker.on('message', this._handleMessage);
  }

  public get state(): PhasedCommandWorkerState {
    return this._state;
  }

  /**
   * Ensures that the specified operations are built and up to date.
   * @param operations - The operations to build.
   * @returns The results of all operations that were built in the process.
   */
  public async updateAsync(operations: ITransferableOperation[]): Promise<ITransferableOperationStatus[]> {
    await this.readyAsync();

    // Define a new ready signal
    this._readySignal = createSignal(() => this._updateState('waiting'));

    const targets: string[] = [];
    for (const operation of operations) {
      const { project, phase } = operation;
      if (project && phase) {
        targets.push(`${project};${phase}`);
      }
    }

    const buildMessage: IRushWorkerBuildMessage = {
      type: 'build',
      value: {
        targets
      }
    };

    this._activeGraphSignal = createSignal();

    this._updateState('updating');
    this._worker.postMessage(buildMessage);

    const statuses: ITransferableOperationStatus[] | void = await Promise.race([
      this._exitSignal.promise,
      this._activeGraphSignal.promise
    ]);

    if (!statuses) {
      throw new Error(`Worker has exited!`);
    }

    return statuses;
  }

  /**
   * After the worker initializes, returns the list of all operations that are defined for the
   * command the worker was initialzed with.
   *
   * @returns The list of known operations in the command for which this worker was initialized.
   */
  public async getGraphAsync(): Promise<ITransferableOperation[]> {
    const results: void | ITransferableOperation[] = await Promise.race([
      this._exitSignal.promise,
      this._graphSignal.promise
    ]);
    if (!results) {
      throw new Error(`Worker has exited!`);
    }
    return results;
  }

  /**
   * Waits for the worker to be ready to receive input.
   *
   * @returns A promise that resolves when the worker is ready for more input.
   */
  public async readyAsync(): Promise<void> {
    await Promise.race([this._exitSignal.promise.then(() => this._checkExited()), this._readySignal.promise]);
  }

  /**
   * Aborts the current execution.
   * @returns A promise that resolves when the worker has aborted.
   */
  public async abortAsync(): Promise<void> {
    this._checkExited();
    this._updateState('updating');

    this._worker.postMessage(abortMessage);
    await this.readyAsync();
  }

  /**
   * Aborts and shuts down the worker.
   *
   * @param force - Force terminates all outstanding work.
   *
   * @returns A promise that resolves when the worker has shut down.
   */
  public async shutdownAsync(force?: boolean): Promise<void> {
    if (this._state === 'exited') {
      return;
    }
    this._updateState('exiting');
    this._worker.postMessage(shutdownMessage);
    if (force) {
      await this._worker.terminate();
    } else {
      await this._exitSignal.promise;
    }
  }

  private _updateState(state: PhasedCommandWorkerState): void {
    const oldState: PhasedCommandWorkerState = this._state;
    if (state !== oldState) {
      this._state = state;
      this.onStateChanged(state);
    }
  }

  private _checkExited(): void {
    if (this._state === 'exited') {
      throw new Error(`Worker has exited!`);
    }
    if (this._state === 'exiting') {
      throw new Error(`Worker is exiting!`);
    }
  }

  private _handleMessage = (message: IRushWorkerResponse): void => {
    switch (message.type) {
      case 'graph':
        this._graphSignal.resolve(message.value.operations);
        break;
      case 'activeGraph':
        this._activeGraphSignal.resolve(message.value.operations);
        break;
      case 'ready':
        if (this._state !== 'exiting') {
          this._readySignal.resolve();
        }
        break;
      case 'operation':
        this._statusByOperation.set(message.value.operation.name!, message.value);
        this.onStatusUpdate(message.value);
        break;
    }
  };
}
