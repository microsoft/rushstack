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
  private _callbacks: ICallbackFn[];
  private _interval: number;
  private _intervalId: NodeJS.Timeout | undefined;
  private _isRunning: boolean;

  public constructor(options: IPeriodicCallbackOptions) {
    this._callbacks = [];
    this._interval = options.interval;
    this._isRunning = false;
  }

  public addCallback(callback: ICallbackFn): void {
    if (this._isRunning) {
      throw new Error('Can not add callback while watcher is running');
    }
    this._callbacks.push(callback);
  }

  public start(): void {
    if (this._intervalId) {
      throw new Error('Watcher already started');
    }
    if (this._callbacks.length === 0) {
      return;
    }
    this._isRunning = true;
    this._intervalId = setInterval(() => {
      this._callbacks.forEach((callback) => callback());
    }, this._interval);
  }

  public stop(): void {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = undefined;
      this._isRunning = false;
    }
  }
}
