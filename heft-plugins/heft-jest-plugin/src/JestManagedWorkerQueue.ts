// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { EventEmitter } from 'node:events';
import { totalmem } from 'node:os';

import { FifoQueue, type WorkerPoolInterface } from 'jest-worker';

type WorkerHandle = ReturnType<WorkerPoolInterface['getWorkers']>[number];
type QueuedTask = Parameters<FifoQueue['enqueue']>[0];

/**
 * Supervises one sequential Jest worker through public task callbacks and lifecycle handles.
 *
 * @remarks
 * Construct Worker with numWorkers=1, maxRetries=0, this taskQueue and the same idleMemoryLimit.
 * Dispatch the first task synchronously after construction to observe the initial handle.
 * Await each task through waitForTaskAsync, then await waitForIdleAsync before dispatching another task.
 * Mark the final task before enqueueing it. Check throwIfFailed before beginShutdown, worker.end
 * and dispose (in finally); tolerate end's forceExited only when replacedAfterFinalTask is true.
 * This queue does not schedule concurrent work or implement caller cancellation.
 */
export class JestManagedWorkerQueue extends FifoQueue {
  readonly #idleMemoryLimit: number | undefined;
  readonly #failureWaiters: Set<(error: Error) => void> = new Set();
  #error: Error | undefined;
  #worker: WorkerHandle | undefined;
  #unsubscribe: (() => void) | undefined;
  #idle: Promise<void> = Promise.resolve();
  #resolveReady: (() => void) | undefined;
  #recycling: boolean = false;
  #finalTask: boolean = false;
  #finalTaskCompleted: boolean = false;
  #classifyingFinalRecycle: boolean = false;
  #replacedAfterFinalTask: boolean = false;
  #resolveFinalState: ((state: WorkerHandle['state']) => void) | undefined;
  #ending: boolean = false;

  public constructor(idleMemoryLimit: number | undefined) {
    super();
    this.#idleMemoryLimit =
      idleMemoryLimit === undefined
        ? undefined
        : Math.floor(
            idleMemoryLimit > 0 && idleMemoryLimit <= 1 ? totalmem() * idleMemoryLimit : idleMemoryLimit
          );
  }

  public override enqueue(task: QueuedTask, workerId?: number): void {
    const isFinalTask: boolean = this.#finalTask;
    super.enqueue(
      {
        ...task,
        onStart: (worker) => {
          if (this.#worker !== worker) {
            if (this.#worker) {
              this.#fail(new Error('Managed Jest worker handle was replaced unexpectedly.'));
              // The old handle was stopped by fail; the newly supplied handle is also owned.
              worker.forceExit();
            }
            this.#unsubscribe?.();
            this.#worker = worker;
            // WorkerOptions.on declares "state-change"; built-in handles inherit EventEmitter.
            if (!(worker instanceof EventEmitter)) {
              this.#fail(new Error('Jest worker does not expose its lifecycle events.'));
            } else {
              this.#unsubscribe = this.#subscribeToStateChanges(worker);
              this.#observeState(worker.state);
            }
          }
          task.onStart(worker);
        },
        onEnd: (error, result) => {
          if (!error && isFinalTask) {
            this.#finalTaskCompleted = true;
            const worker: WorkerHandle | undefined = this.#worker;
            const limit: number | undefined = this.#idleMemoryLimit;
            if (worker && limit !== undefined) {
              this.#classifyingFinalRecycle = true;
              const finalState: Promise<WorkerHandle['state']> = new Promise((resolve) => {
                this.#resolveFinalState = resolve;
              });
              this.#idle = this.#classifyFinalRecycleAsync(worker, limit, finalState)
                .catch((idleError: Error) => {
                  this.#fail(idleError);
                })
                .finally(() => {
                  this.#resolveFinalState = undefined;
                  this.#classifyingFinalRecycle = false;
                  this.#observeState(worker.state);
                });
              this.#idle.catch((idleError: Error) => this.#fail(idleError));
            }
          } else if (!error && !this.#ending && this.#worker) {
            const worker: WorkerHandle = this.#worker;
            const limit: number | undefined = this.#idleMemoryLimit;
            if (limit !== undefined) {
              this.#idle = this.#waitForIdleAsync(worker, limit);
              this.#idle.catch((idleError: Error) => this.#fail(idleError));
            }
          }
          task.onEnd(error, result);
        }
      },
      workerId
    );
  }

  /**
   * Observes lifecycle failures only until this task settles, without retaining completed task results.
   * Rejects immediately if the queue has already failed; otherwise forwards the first observed outcome.
   * This does not cancel the supplied task.
   */
  public waitForTaskAsync<T>(task: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (this.#error) {
        reject(this.#error);
      } else {
        this.#failureWaiters.add(reject);
      }
      // Always observe task rejection, even if a lifecycle failure has already won.
      task.then(
        (result) => {
          this.#failureWaiters.delete(reject);
          resolve(result);
        },
        (error: unknown) => {
          this.#failureWaiters.delete(reject);
          reject(error);
        }
      );
    });
  }

  public async waitForIdleAsync(): Promise<void> {
    await this.waitForTaskAsync(this.#idle);
    this.throwIfFailed();
  }

  public throwIfFailed(): void {
    if (this.#error) throw this.#error;
  }

  public beginShutdown(): void {
    this.#ending = true;
  }

  public get replacedAfterFinalTask(): boolean {
    return this.#replacedAfterFinalTask;
  }

  public markFinalTask(): void {
    if (this.#finalTask || this.#ending) {
      throw new Error('Managed Jest final worker task was already marked.');
    }
    this.#finalTask = true;
  }

  public dispose(): void {
    this.#unsubscribe?.();
  }

  // Create long-lived listeners outside the enqueue closure so they do not retain its first task.
  #subscribeToStateChanges(worker: WorkerHandle & EventEmitter): () => void {
    const onStateChange = (state: WorkerHandle['state']): void => {
      // Memory resolves before RESTARTING; zero-limit processes restart before onEnd.
      // Defer classification until the memory evidence and final-task state are installed.
      queueMicrotask(() => this.#observeState(state));
    };
    worker.on('state-change', onStateChange);
    return () => worker.off('state-change', onStateChange);
  }

  async #waitForIdleAsync(worker: WorkerHandle, limit: number): Promise<void> {
    if (limit === 0) {
      // Processes support unconditional recycling; threads currently treat zero as disabled.
      this.#recycling = worker.state === 'restarting';
    } else {
      const memory: number | null = await worker.getMemoryUsage();
      if (memory === null) throw new Error('Jest worker did not report its idle memory usage.');
      this.#recycling = memory > limit;
    }
    if (this.#recycling) {
      await new Promise<void>((resolve) => {
        this.#resolveReady = resolve;
        this.#observeState(worker.state);
      });
      // "ok" means spawned, not bootstrapped. A memory response proves message-loop readiness
      // without running another task (which would itself trigger idle-memory recycling).
      if ((await worker.getMemoryUsage()) === null) {
        throw new Error('Recycled Jest worker did not acknowledge readiness.');
      }
    }
  }

  async #classifyFinalRecycleAsync(
    worker: WorkerHandle,
    limit: number,
    finalState: Promise<WorkerHandle['state']>
  ): Promise<void> {
    if (limit === 0) {
      this.#recycling = worker.state === 'restarting';
    } else {
      const result:
        | { memory: number | null; state?: undefined }
        | { memory?: undefined; state: WorkerHandle['state'] } = await Promise.race([
        worker.getMemoryUsage().then((memory) => ({ memory })),
        finalState.then((state) => ({ state }))
      ]);
      if (result.state !== undefined) {
        throw new Error(`Managed Jest worker stopped before reporting final memory usage (${result.state}).`);
      }
      const memory: number | null = result.memory;
      if (memory === null) throw new Error('Jest worker did not report its idle memory usage.');
      this.#recycling = memory > limit;
    }
    if (this.#recycling && (worker.state === 'restarting' || worker.state === 'starting')) {
      this.#replacedAfterFinalTask = true;
    }
  }

  #observeState(state: WorkerHandle['state']): void {
    if (
      this.#finalTaskCompleted &&
      (state === 'restarting' ||
        state === 'starting' ||
        state === 'oom' ||
        state === 'shutting-down' ||
        state === 'shut-down')
    ) {
      this.#resolveFinalState?.(state);
    }
    if (this.#finalTaskCompleted && this.#recycling && (state === 'restarting' || state === 'starting')) {
      this.#replacedAfterFinalTask = true;
    }
    if (this.#ending || this.#classifyingFinalRecycle) return;
    switch (state) {
      case 'ok':
        if (this.#recycling) {
          this.#recycling = false;
          this.#resolveReady?.();
          this.#resolveReady = undefined;
        }
        break;
      case 'restarting':
      case 'starting':
        if (!this.#recycling) {
          this.#fail(new Error('Managed Jest worker restarted unexpectedly.'));
        }
        break;
      case 'oom':
      case 'shutting-down':
      case 'shut-down':
        this.#fail(new Error(`Managed Jest worker stopped unexpectedly (${state}).`));
        break;
    }
  }

  #fail(error: Error): void {
    if (this.#error) return;
    this.#error = error;
    for (const reject of this.#failureWaiters) {
      reject(error);
    }
    this.#failureWaiters.clear();
    // maxRetries=0 prevents replay, but Jest may already have spawned a replacement.
    if (this.#worker && this.#worker.state !== 'shut-down' && this.#worker.state !== 'shutting-down') {
      this.#worker.forceExit();
    }
  }
}
