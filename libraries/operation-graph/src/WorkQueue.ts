// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Async, MinimumHeap } from '@rushstack/node-core-library';

import { OperationStatus } from './OperationStatus';

interface IQueueItem {
  task: () => Promise<void>;
  priority: number;
}

export class WorkQueue {
  private readonly _queue: MinimumHeap<IQueueItem>;
  private readonly _abortSignal: AbortSignal;
  private readonly _abortPromise: Promise<void>;

  private _pushPromise: Promise<void>;
  private _resolvePush: () => void;
  private _resolvePushTimeout: NodeJS.Timeout | undefined;

  public constructor(abortSignal: AbortSignal) {
    // Sort by priority descending. Thus the comparator returns a negative number if a has higher priority than b.
    this._queue = new MinimumHeap((a: IQueueItem, b: IQueueItem) => b.priority - a.priority);
    this._abortSignal = abortSignal;
    this._abortPromise = abortSignal.aborted
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          abortSignal.addEventListener('abort', () => resolve(), { once: true });
        });

    [this._pushPromise, this._resolvePush] = Async.getSignal();
    this._resolvePushTimeout = undefined;
  }

  public async *[Symbol.asyncIterator](): AsyncIterableIterator<() => Promise<void>> {
    while (!this._abortSignal.aborted) {
      while (this._queue.size > 0) {
        const item: IQueueItem = this._queue.poll()!;
        yield item.task;
      }

      await Promise.race([this._pushPromise, this._abortPromise]);
    }
  }

  public pushAsync(task: () => Promise<OperationStatus>, priority: number): Promise<OperationStatus> {
    return new Promise((resolve, reject) => {
      this._queue.push({
        task: () => task().then(resolve, reject),
        priority
      });

      // ESLINT: "Promises must be awaited, end with a call to .catch, end with a call to .then ..."
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this._abortPromise.finally(() => resolve(OperationStatus.Aborted));

      this._resolvePushDebounced();
    });
  }

  private _resolvePushDebounced(): void {
    if (!this._resolvePushTimeout) {
      this._resolvePushTimeout = setTimeout(() => {
        this._resolvePushTimeout = undefined;
        this._resolvePush();

        [this._pushPromise, this._resolvePush] = Async.getSignal();
      });
    }
  }
}
