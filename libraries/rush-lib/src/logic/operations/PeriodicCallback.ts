// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export type ICallbackFn = () => Promise<void> | void;

export interface IPeriodicCallbackOptions {
  interval: number;
}

/**
 * A help class to run callbacks in a loop with a specified interval.
 *
 * @beta
 */
export class PeriodicCallback {
  #callbacks: ICallbackFn[];
  #interval: number;
  #intervalId: NodeJS.Timeout | undefined;
  #isRunning: boolean;

  public constructor(options: IPeriodicCallbackOptions) {
    this.#callbacks = [];
    this.#interval = options.interval;
    this.#isRunning = false;
  }

  public addCallback(callback: ICallbackFn): void {
    if (this.#isRunning) {
      throw new Error('Can not add callback while watcher is running');
    }
    this.#callbacks.push(callback);
  }

  public start(): void {
    if (this.#intervalId) {
      throw new Error('Watcher already started');
    }
    if (this.#callbacks.length === 0) {
      return;
    }
    this.#isRunning = true;
    this.#intervalId = setInterval(() => {
      this.#callbacks.forEach((callback) => callback());
    }, this.#interval);
  }

  public stop(): void {
    if (this.#intervalId) {
      clearInterval(this.#intervalId);
      this.#intervalId = undefined;
      this.#isRunning = false;
    }
  }
}
