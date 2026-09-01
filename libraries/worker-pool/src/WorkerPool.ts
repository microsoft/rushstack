// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type ResourceLimits, Worker } from 'node:worker_threads';

/**
 * Symbol to read the ID off of a worker
 * @internal
 */
export const WORKER_ID_SYMBOL: unique symbol = Symbol('workerId');

/**
 * @internal
 */
export interface IWorkerPoolOptions {
  /**
   * Identifier for this pool, to assign to its workers for tracking
   */
  id: string;
  /**
   * Maximum number of concurrent workers this WorkerPool may spawn.
   */
  maxWorkers: number;
  /**
   * Optional callback invoked when a worker is destroyed.
   */
  onWorkerDestroyed?: () => void;
  /**
   * Optional callback invoked on a newly created worker.
   */
  prepareWorker?: (worker: Worker) => void;
  /**
   * Optional data to pass to workers when they are initialized.
   * Will be subjected to the Structured Clone algorithm.
   */
  workerData?: unknown;
  /**
   * Absolute path to the worker script.
   */
  workerScriptPath: string;

  /**
   * Optional resource limits for the workers.
   */
  workerResourceLimits?: ResourceLimits;
}

/**
 * Manages a pool of workers.
 * Workers will be shutdown by sending them the boolean value `false` in a postMessage.
 * @internal
 */
export class WorkerPool {
  public id: string;
  public maxWorkers: number;

  readonly #alive: Worker[];
  #error: Error | undefined;
  #finishing: boolean;
  readonly #idle: Worker[];
  #nextId: number;
  readonly #onComplete: [() => void, (error: Error) => void][];
  readonly #onWorkerDestroyed: (() => void) | undefined;
  readonly #pending: [(worker: Worker) => void, (error: Error) => void][];
  readonly #prepare: ((worker: Worker) => void) | undefined;
  readonly #workerData: unknown;
  readonly #workerScript: string;
  readonly #workerResourceLimits: ResourceLimits | undefined;

  public constructor(options: IWorkerPoolOptions) {
    const {
      id,
      maxWorkers,
      onWorkerDestroyed,
      prepareWorker,
      workerData,
      workerScriptPath,
      workerResourceLimits
    } = options;

    this.id = id;
    this.maxWorkers = maxWorkers;
    this.#alive = [];
    this.#error = undefined;
    this.#finishing = false;
    this.#idle = [];
    this.#nextId = 0;
    this.#onComplete = [];
    this.#onWorkerDestroyed = onWorkerDestroyed;
    this.#pending = [];
    this.#prepare = prepareWorker;
    this.#workerData = workerData;
    this.#workerScript = workerScriptPath;
    this.#workerResourceLimits = workerResourceLimits;
  }

  /**
   * Gets the count of active workers.
   */
  public getActiveCount(): number {
    return this.#alive.length - this.#idle.length;
  }

  /**
   * Gets the count of idle workers.
   */
  public getIdleCount(): number {
    return this.#idle.length;
  }

  /**
   * Gets the count of live workers.
   */
  public getLiveCount(): number {
    return this.#alive.length;
  }

  /**
   * Tells the pool to shut down when all workers are done.
   * Returns a promise that will be fulfilled if all workers finish successfully, or reject with the first error.
   */
  public async finishAsync(): Promise<void> {
    this.#finishing = true;

    if (this.#error) {
      throw this.#error;
    }

    if (!this.#alive.length) {
      // The pool has no live workers, this is a no-op
      return;
    }

    // Clean up all idle workers
    for (const worker of this.#idle.splice(0)) {
      worker.postMessage(false);
    }

    // There are still active workers, wait for them to clean up.
    await new Promise<void>((resolve, reject) => this.#onComplete.push([resolve, reject]));
  }

  /**
   * Resets the pool and allows more work
   */
  public reset(): void {
    this.#finishing = false;
    this.#error = undefined;
  }

  /**
   * Returns a worker to the pool. If the pool is finishing, deallocates the worker.
   * @param worker - The worker to free
   */
  public checkinWorker(worker: Worker): void {
    if (this.#error) {
      // Shut down the worker (failure)
      worker.postMessage(false);
      return;
    }

    const next: [(worker: Worker) => void, unknown] | undefined = this.#pending.shift();

    if (next) {
      // Perform the next unit of work;
      next[0](worker);
    } else if (this.#finishing) {
      // Shut down the worker (success)
      worker.postMessage(false);
    } else {
      // No pending work, idle the workers
      this.#idle.push(worker);
    }
  }

  /**
   * Checks out a currently available worker or waits for the next free worker.
   * @param allowCreate - If creating new workers is allowed (subject to maxSize)
   */
  public async checkoutWorkerAsync(allowCreate: boolean): Promise<Worker> {
    if (this.#error) {
      throw this.#error;
    }

    let worker: Worker | undefined = this.#idle.shift();
    if (!worker && allowCreate) {
      worker = this.#createWorker();
    }

    if (worker) {
      return worker;
    }

    return await new Promise((resolve: (worker: Worker) => void, reject: (error: Error) => void) => {
      this.#pending.push([resolve, reject]);
    });
  }

  /**
   * Creates a new worker if allowed by maxSize.
   */
  #createWorker(): Worker | undefined {
    if (this.#alive.length >= this.maxWorkers) {
      return;
    }

    const worker: Worker & {
      [WORKER_ID_SYMBOL]?: string;
    } = new Worker(this.#workerScript, {
      eval: false,
      workerData: this.#workerData,
      resourceLimits: this.#workerResourceLimits
    });

    const id: string = `${this.id}#${++this.#nextId}`;
    worker[WORKER_ID_SYMBOL] = id;

    this.#alive.push(worker);

    worker.on('error', (err) => {
      this.#onError(err);
      this.#destroyWorker(worker);
    });

    worker.once('exit', (exitCode) => {
      if (exitCode !== 0) {
        this.#onError(new Error(`Worker ${id} exited with code ${exitCode}`));
      }
      this.#destroyWorker(worker);
    });

    if (this.#prepare) {
      this.#prepare(worker);
    }

    return worker;
  }

  /**
   * Cleans up a worker
   */
  #destroyWorker(worker: Worker): void {
    const aliveIndex: number = this.#alive.indexOf(worker);
    if (aliveIndex >= 0) {
      this.#alive.splice(aliveIndex, 1);
    }

    const freeIndex: number = this.#idle.indexOf(worker);
    if (freeIndex >= 0) {
      this.#idle.splice(freeIndex, 1);
    }

    worker.unref();

    if (this.#onWorkerDestroyed) {
      this.#onWorkerDestroyed();
    }

    if (!this.#alive.length && !this.#error) {
      for (const [resolve] of this.#onComplete.splice(0)) {
        resolve();
      }
    }
  }

  /**
   * Notifies all pending callbacks that an error has occurred and switches this pool into error state.
   */
  #onError(error: Error): void {
    this.#error = error;

    for (const [, reject] of this.#pending.splice(0)) {
      reject(this.#error);
    }

    for (const [, reject] of this.#onComplete.splice(0)) {
      reject(this.#error);
    }
  }
}
