// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Represents a typical timer/stopwatch which keeps track
 * of elapsed time in between two events.
 *
 * @public
 */
export class Stopwatch {
  private _startTime: number | undefined;
  private _endTime: number | undefined;
  private _running: boolean;

  public constructor() {
    this._startTime = undefined;
    this._endTime = undefined;
    this._running = false;
  }

  /**
   * Static helper function which creates a stopwatch which is immediately started
   */
  public static start(): Stopwatch {
    return new Stopwatch().start();
  }

  public get isRunning(): boolean {
    return this._running;
  }

  /**
   * Starts the stopwatch. Note that if end() has been called,
   * reset() should be called before calling start() again.
   */
  public start(): Stopwatch {
    if (this._startTime !== undefined) {
      throw new Error('Call reset() before starting the Stopwatch');
    }
    this._startTime = performance.now();
    this._endTime = undefined;
    this._running = true;
    return this;
  }

  /**
   * Stops executing the stopwatch and saves the current timestamp
   */
  public stop(): Stopwatch {
    this._endTime = this._startTime !== undefined ? performance.now() : undefined;
    this._running = false;
    return this;
  }

  /**
   * Resets all values of the stopwatch back to the original
   */
  public reset(): Stopwatch {
    this._endTime = this._startTime = undefined;
    this._running = false;
    return this;
  }

  /**
   * Displays how long the stopwatch has been executing in a human readable format.
   */
  public toString(): string {
    if (!this._running && this._startTime === undefined) {
      return '0.00 seconds (stopped)';
    }
    const totalSeconds: number = this.duration;

    if (totalSeconds > 60) {
      const minutes: number = Math.floor(totalSeconds / 60);
      const seconds: number = totalSeconds % 60.0;

      return `${minutes.toFixed(0)} minute${minutes === 1 ? '' : 's'} ${seconds.toFixed(1)} seconds`;
    } else {
      return `${totalSeconds.toFixed(2)} seconds`;
    }
  }

  /**
   * Get the duration in seconds.
   */
  public get duration(): number {
    if (this._startTime === undefined) {
      return 0;
    }
    const curTime: number = this._endTime !== undefined ? this._endTime : performance.now();

    return (curTime - this._startTime) / 1000.0;
  }

  /**
   * Return the start time of the most recent stopwatch run.
   */
  public get startTime(): number | undefined {
    return this._startTime;
  }

  /**
   * Return the end time of the most recent stopwatch run.
   */
  public get endTime(): number | undefined {
    return this._endTime;
  }
}
