// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Utilities } from './Utilities';

/**
 * Used with the Stopwatch class.
 */
export enum StopwatchState {
  Stopped = 1,
  Started = 2
}

/**
 * Represents a readonly view of a `Stopwatch`.
 * @beta
 */
export interface IStopwatchResult {
  /**
   * Displays how long the stopwatch has been executing in a human readable format.
   */
  toString(): string;
  /**
   * Get the duration in seconds.
   */
  get duration(): number;
  /**
   * Return the start time of the most recent stopwatch run.
   */
  get startTime(): number | undefined;
  /**
   * Return the end time of the most recent stopwatch run.
   */
  get endTime(): number | undefined;
}

/**
 * Represents a typical timer/stopwatch which keeps track
 * of elapsed time in between two events.
 */
export class Stopwatch implements IStopwatchResult {
  #startTime: number | undefined;
  #endTime: number | undefined;
  #state: StopwatchState;

  #getTime: () => number;

  public constructor(getTime: () => number = Utilities.getTimeInMs) {
    this.#startTime = undefined;
    this.#endTime = undefined;
    this.#getTime = getTime;
    this.#state = StopwatchState.Stopped;
  }

  public static fromState({ startTime, endTime }: { startTime: number; endTime: number }): Stopwatch {
    const stopwatch: Stopwatch = new Stopwatch();
    stopwatch.#startTime = startTime;
    stopwatch.#endTime = endTime;
    stopwatch.#state = StopwatchState.Stopped;
    return stopwatch;
  }

  /**
   * Static helper function which creates a stopwatch which is immediately started
   */
  public static start(startTimeOverride?: number): Stopwatch {
    return new Stopwatch().start(startTimeOverride);
  }

  public get state(): StopwatchState {
    return this.#state;
  }

  /**
   * Starts the stopwatch. Note that if end() has been called,
   * reset() should be called before calling start() again.
   */
  public start(startTimeOverride?: number): Stopwatch {
    if (this.#startTime !== undefined) {
      throw new Error('Call reset() before starting the Stopwatch');
    }
    this.#startTime = startTimeOverride ?? this.#getTime();
    this.#endTime = undefined;
    this.#state = StopwatchState.Started;
    return this;
  }

  /**
   * Stops executing the stopwatch and saves the current timestamp
   */
  public stop(): Stopwatch {
    this.#endTime = this.#startTime !== undefined ? this.#getTime() : undefined;
    this.#state = StopwatchState.Stopped;
    return this;
  }

  /**
   * Resets all values of the stopwatch back to the original
   */
  public reset(): Stopwatch {
    this.#endTime = this.#startTime = undefined;
    this.#state = StopwatchState.Stopped;
    return this;
  }

  /**
   * Displays how long the stopwatch has been executing in a human readable format.
   */
  public toString(): string {
    if (this.#state === StopwatchState.Stopped && this.#startTime === undefined) {
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
    const curTime: number = this.#endTime !== undefined ? this.#endTime : this.#getTime();

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
