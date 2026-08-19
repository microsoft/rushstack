// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Async, MinimumHeap } from '@rushstack/node-core-library';

import { OperationStatus } from './OperationStatus';

interface IQueueItem {
  task: () => Promise<void>;
  priority: number;
}

export class WorkQueue {
  readonly #queue: MinimumHeap<IQueueItem>;
  readonly #abortSignal: AbortSignal;
  readonly #abortPromise: Promise<void>;

  #pushPromise: Promise<void>;
  #resolvePush: () => void;
  #resolvePushTimeout: NodeJS.Timeout | undefined;

  public constructor(abortSignal: AbortSignal) {
    // Sort by priority descending. Thus the comparator returns a negative number if a has higher priority than b.
    this.#queue = new MinimumHeap((a: IQueueItem, b: IQueueItem) => b.priority - a.priority);
    this.#abortSignal = abortSignal;
    this.#abortPromise = abortSignal.aborted
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          abortSignal.addEventListener('abort', () => resolve(), { once: true });
        });

    [this.#pushPromise, this.#resolvePush] = Async.getSignal();
    this.#resolvePushTimeout = undefined;
  }

  public async *[Symbol.asyncIterator](): AsyncIterableIterator<() => Promise<void>> {
    while (!this.#abortSignal.aborted) {
      while (this.#queue.size > 0) {
        const item: IQueueItem = this.#queue.poll()!;
        yield item.task;
      }

      await Promise.race([this.#pushPromise, this.#abortPromise]);
    }
  }

  public pushAsync(task: () => Promise<OperationStatus>, priority: number): Promise<OperationStatus> {
    return new Promise((resolve, reject) => {
      this.#queue.push({
        task: () => task().then(resolve, reject),
        priority
      });

      // ESLINT: "Promises must be awaited, end with a call to .catch, end with a call to .then ..."
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.#abortPromise.finally(() => resolve(OperationStatus.Aborted));

      this.#resolvePushDebounced();
    });
  }

  #resolvePushDebounced(): void {
    if (!this.#resolvePushTimeout) {
      this.#resolvePushTimeout = setTimeout(() => {
        this.#resolvePushTimeout = undefined;
        this.#resolvePush();

        [this.#pushPromise, this.#resolvePush] = Async.getSignal();
      });
    }
  }
}
