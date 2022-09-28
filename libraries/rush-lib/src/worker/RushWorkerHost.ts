// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { Worker, SHARE_ENV } from 'worker_threads';
import { OperationStatus } from '../logic/operations/OperationStatus';
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
  onStatusUpdates?: (operationStatus: ITransferableOperationStatus[]) => void;

  /**
   * Callback invoked when worker state changes
   */
  onStateChanged?: (state: PhasedCommandWorkerState) => void;
}

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
  public onStatusUpdates: (statuses: ITransferableOperationStatus[]) => void;

  private readonly _worker: Worker;
  private _state: PhasedCommandWorkerState;

  private readonly _statusByOperation: Map<string, ITransferableOperationStatus>;
  private readonly _activeOperations: Set<string>;
  private readonly _pendingOperations: Set<string>;

  private readonly _exitSignal: ISignal<void>;
  private readonly _graphSignal: ISignal<ITransferableOperation[]>;

  private _graph: ITransferableOperation[] | undefined = undefined;

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
      onStatusUpdates = () => {
        // Noop
      },
      onStateChanged = () => {
        // Noop
      }
    } = options ?? {};

    this._state = 'initializing';
    this._statusByOperation = new Map();
    this._activeOperations = new Set();
    this._pendingOperations = new Set();

    this._graphSignal = createSignal();

    this._exitSignal = createSignal(() => {
      this._updateState('exited');
    });

    this.onStatusUpdates = onStatusUpdates;
    this.onStateChanged = onStateChanged;

    const workerPath: string = path.resolve(__dirname, 'RushWorkerEntry.js');
    const worker: Worker = new Worker(workerPath, {
      workerData: {
        argv: args,
        cwd
      },
      env: SHARE_ENV,
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
  public update(operations: ITransferableOperation[]): void {
    this._checkExited();

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

    this._updateState('updating');
    this._worker.postMessage(buildMessage);
  }

  /**
   * After the worker initializes, returns the list of all operations that are defined for the
   * command the worker was initialzed with.
   *
   * @returns The list of known operations in the command for which this worker was initialized.
   */
  public getGraph(): ITransferableOperation[] {
    if (!this._graph) {
      throw new Error(`Worker is still initializing!`);
    }
    this._checkExited();
    return this._graph;
  }

  public getStatuses(): Iterable<ITransferableOperationStatus> {
    return this._statusByOperation.values();
  }

  public get activeOperationCount(): number {
    return this._activeOperations.size;
  }
  public get pendingOperationCount(): number {
    return this._pendingOperations.size;
  }

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
   * Aborts the current execution.
   * @returns A promise that resolves when the worker has aborted.
   */
  public abort(): void {
    return this.update([]);
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
        this._graph = message.value.operations;
        this._graphSignal.resolve(message.value.operations);
        break;
      case 'ready':
        if (this._state !== 'exiting') {
          this._updateState('waiting');
        }
        break;
      case 'operations':
        for (const operation of message.value.operations) {
          const name: string = operation.operation.name!;
          this._statusByOperation.set(name, operation);

          if (operation.active) {
            this._activeOperations.add(name);
            if (
              operation.status === OperationStatus.Ready ||
              operation.status === OperationStatus.Executing
            ) {
              this._pendingOperations.add(name);
            } else {
              this._pendingOperations.delete(name);
            }
          } else {
            this._activeOperations.delete(name);
            this._pendingOperations.delete(name);
          }
        }
        if (this._state !== 'exiting' && this._pendingOperations.size > 0) {
          this._updateState('executing');
        }
        this.onStatusUpdates(message.value.operations);
        break;
    }
  };
}
