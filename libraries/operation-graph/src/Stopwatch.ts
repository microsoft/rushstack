// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Represents a typical timer/stopwatch which keeps track
 * of elapsed time in between two events.
 *
 * @public
 */
export class Stopwatch {
  #startTime: number | undefined;
  #endTime: number | undefined;
  #running: boolean;

  public constructor() {
    this.#startTime = undefined;
    this.#endTime = undefined;
    this.#running = false;
  }

  /**
   * Static helper function which creates a stopwatch which is immediately started
   */
  public static start(): Stopwatch {
    return new Stopwatch().start();
  }

  public get isRunning(): boolean {
    return this.#running;
  }

  /**
   * Starts the stopwatch. Note that if end() has been called,
   * reset() should be called before calling start() again.
   */
  public start(): Stopwatch {
    if (this.#startTime !== undefined) {
      throw new Error('Call reset() before starting the Stopwatch');
    }
    this.#startTime = performance.now();
    this.#endTime = undefined;
    this.#running = true;
    return this;
  }

  /**
   * Stops executing the stopwatch and saves the current timestamp
   */
  public stop(): Stopwatch {
    this.#endTime = this.#startTime !== undefined ? performance.now() : undefined;
    this.#running = false;
    return this;
  }

  /**
   * Resets all values of the stopwatch back to the original
   */
  public reset(): Stopwatch {
    this.#endTime = this.#startTime = undefined;
    this.#running = false;
    return this;
  }

  /**
   * Displays how long the stopwatch has been executing in a human readable format.
   */
  public toString(): string {
    if (!this.#running && this.#startTime === undefined) {
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
    if (this.#startTime === undefined) {
      return 0;
    }
    const curTime: number = this.#endTime !== undefined ? this.#endTime : performance.now();

    return (curTime - this.#startTime) / 1000.0;
  }

  /**
   * Return the start time of the most recent stopwatch run.
   */
  public get startTime(): number | undefined {
    return this.#startTime;
  }

  /**
   * Return the end time of the most recent stopwatch run.
   */
  public get endTime(): number | undefined {
    return this.#endTime;
  }
}
