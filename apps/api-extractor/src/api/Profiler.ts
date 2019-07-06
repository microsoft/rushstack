// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as process from 'process';
import { InternalError } from '@microsoft/node-core-library';

// tslint:disable:no-bitwise

export const enum ExtractorTimerId {
  Overall = 'Overall',
  CompilerSemanticAnalysis = 'CompilerSemanticAnalysis',
  CollectorProcessing = 'CollectorProcessing',
  TSDocParser = 'TSDocParser'
}

// Node 10 introduces process.hrtime.bigint(), but we don't want to require Node 10 yet.
// Instead we pack the two parts into a floating point number of milliseconds.
function getCurrentTimemark(): number {
  // seconds, nanoseconds
  const hrtime: [number, number] = process.hrtime();

  const MS_PER_SEC: number = 1e3;
  const MS_PER_NS: number = 1e-6;

  // Convert seconds to ms.
  // The mantissa is 52 bits, so we spend 32 bits on the milliseconds part, leaving ~20 bits for the nanoseconds.
  // 32 bits of milliseconds will overflow every 49 days, which should be plenty for performance measurements.
  let ms: number = (hrtime[0] * MS_PER_SEC) & 0xffffffff;

  // Convert nanoseconds to ms
  ms += hrtime[1] * MS_PER_NS;

  return ms;
}

// Returns nowTimemark minus thenTimemark in floating point milliseconds.
// The nowTimemark must not be older than thenTimemark.
function measureTimemarkMs(nowTimemark: number, thenTimemark: number): number {
  const intervalMs: number = nowTimemark - thenTimemark;
  if (intervalMs >= -100) {
    // Allow up to 100 ms of clock drift
    return intervalMs;
  }

  if (intervalMs > -10000.0) {
    // The process.hrtime() clock is never supposed to run backwards
    throw new InternalError('The timer interval cannot be negative');
  }

  // The value is negative because it has overflowed the 32-bit range of getCurrentTimemark()

  // Decompose the value into its parts
  const integerPart: number = Math.floor(intervalMs);
  const fractionalPart: number = intervalMs - integerPart;

  // Normalize the integer part, then reassemble the value
  return (integerPart & 0xffffffff) + fractionalPart;
}

export abstract class ProfileTimer {
  /**
   * The identifier used when starting/stopping this timer.
   */
  public readonly timerId: string;

  protected constructor(timerId: string) {
    this.timerId = timerId;
  }

  /**
   * True if `Profiler.start()` was called for this timer (and `Profiler.stop()` has not been called yet).
   */
  public abstract get started(): boolean;

  /**
   * True if the `started` property is true AND this is the timer that most recently entered the "started" state.
   *
   * @remarks
   * Within a given `Profiler` instance, at most one timer can be focused.  This is tracked by `Profiler.focusedTimer`.
   */
  public abstract get focused(): boolean;

  /**
   * Counts the number of times that `Profiler.start()` was called for this timer.
   */
  public abstract readonly startedIntervals: number;

  /**
   * The total amount of time spent in the `started` state.
   */
  public abstract get totalStartedMs(): number;

  /**
   * The total amount of time spent in the `focused` state.  This avoids counting time that was already claimed by
   * another timer (within the same `Profiler` instance).
   *
   * @remarks
   * This may be less than `totalStartedMs` if other timers were focused while this timer was started.
   *
   * For example, suppose that:
   * - We have three timers:  Overall, Rendering, and Sorting
   * - The Overall timer starts at the very beginning and stops at the very end.
   * - Rendering starts/stops a few times.
   * - Sorting is an inner loop that sometimes occurs during a Rendering interval, sometimes when we're not Rendering.
   *
   * For Sorting, the `totalStartedMs` and `totalFocusedMs` will be equal.
   * For Rendering, the `totalFocusedMs` will exclude the time spent Sorting while Rendering.
   * For Overall, the `totalFocusedMs` will measure only the time where we were NOT Sorting or Rendering.
   *
   * In this way, `totalFocusedMs` provides an easy way to isolate the performance of individual activities.
   */
  public abstract get totalFocusedMs(): number;

  public formatStartedTime(): string {
    return ProfileTimer.formatTime(this.totalStartedMs);
  }

  public formatFocusedTime(): string {
    return ProfileTimer.formatTime(this.totalFocusedMs);
  }

  public static formatTime(ms: number): string {
    if (ms < 1000) {
      return `${ms.toFixed(3)} ms`;
    }
    const seconds: number = ms / 1000.0;
    if (seconds < 60) {
      return `${seconds.toFixed(3)} secs`;
    }
    const minutes: number = Math.floor(seconds / 60.0);
    const remainderSeconds: number = seconds - minutes;
    return `${minutes} min ${remainderSeconds.toFixed(3)} secs`;
  }
}

class ProfileTimerInternal extends ProfileTimer {
  public readonly profiler: Profiler<string>;

  public startedIntervals: number = 0;

  // The total time accumulated during all previous started periods, not counting the current started period (if any).
  // This total includes unfocused time.
  public partialStartedMs: number = 0;

  // The total time accumulated during any previous focused periods, not counting the current focused period (if any).
  // This total excludes unfocused time.
  public partialFocusedMs: number = 0;

  // The beginning of the current started period, or undefined if the timer is stopped.
  public startedTimemark: number | undefined = undefined;

  // The beginning of the current focused period, or undefined if the timer is unfocused.
  public focusedTimemark: number | undefined = undefined;

  public constructor(profiler: Profiler<string>, timerId: string) {
    super(timerId);
  }

  public get started(): boolean {
    return this.startedTimemark !== undefined;
  }

  public get focused(): boolean {
    return this.focusedTimemark !== undefined;
  }

  public get totalStartedMs(): number {
    let result: number = this.partialStartedMs;
    if (this.startedTimemark !== undefined) {
      // It's still started, so add in the current period so far
      result += measureTimemarkMs(getCurrentTimemark(), this.startedTimemark);
    }
    return result;
  }

  public get totalFocusedMs(): number {
    let result: number = this.partialFocusedMs;
    if (this.focusedTimemark !== undefined) {
      // It's still focused, so add in the current period so far
      result += measureTimemarkMs(getCurrentTimemark(), this.focusedTimemark);
    }
    return result;
  }

  public onStart(timemark: number): void {
    if (this.started) {
      throw new InternalError(`The ProfileTimer "${this.timerId}" is already started`);
    }
    this.startedTimemark = timemark;
    ++this.startedIntervals;
  }

  public onFocus(timemark: number): void {
    if (this.focused) {
      throw new InternalError(`The ProfileTimer "${this.timerId}" is already focused`);
    }
    this.focusedTimemark = timemark;
  }

  public onStop(timemark: number): void {
    if (this.startedTimemark === undefined) {
      throw new InternalError(`The ProfileTimer "${this.timerId}" is already stopped`);
    }
    const accumulatedMs: number = measureTimemarkMs(timemark, this.startedTimemark);
    this.startedTimemark = undefined;
    this.partialStartedMs += accumulatedMs;
  }

  public onUnfocus(timemark: number): void {
    if (this.focusedTimemark === undefined) {
      throw new InternalError(`The ProfileTimer "${this.timerId}" is already unfocused`);
    }
    const accumulatedMs: number = measureTimemarkMs(timemark, this.focusedTimemark);
    this.focusedTimemark = undefined;
    this.partialFocusedMs += accumulatedMs;
  }
}

export class Profiler<TTimerId extends string> {
  private _timersByName: Map<string, ProfileTimerInternal>;
  private _timers: ProfileTimer[];

  private _focusedTimers: ProfileTimerInternal[] = [];
  private _focusedTimer: ProfileTimerInternal | undefined = undefined;

  public constructor() {
    this._timersByName = new Map<string, ProfileTimerInternal>();
    this._timers = [];
  }

  public get focusedTimer(): ProfileTimer | undefined {
    return this._focusedTimer;
  }

  public start(timerId: TTimerId): void {
    const profileTimer: ProfileTimerInternal = this.getTimerInternal(timerId);

    if (profileTimer.started) {
      throw new InternalError(`The profile timer "${timerId}" cannot be started`
        + ` because it is already started`);
    }

    const timemark: number = getCurrentTimemark();

    if (this._focusedTimer) {
      this._focusedTimer.onUnfocus(timemark);
      this._focusedTimer = undefined;
    }

    this._focusedTimers.push(profileTimer);
    this._focusedTimer = profileTimer;

    this._focusedTimer.onStart(timemark);
    this._focusedTimer.onFocus(timemark);
  }

  public stop(timerId: TTimerId): void {
    const profileTimer: ProfileTimerInternal = this.getTimerInternal(timerId);

    if (!profileTimer.started) {
      throw new InternalError(`The profile timer "${timerId}" cannot be stopped`
        + ` because it was never started`);
    }

    if (this.focusedTimer !== profileTimer) {
      throw new InternalError(`The profile timer "${timerId}" cannot be stopped`
        + ` because "${this.focusedTimer!.timerId}" must be stopped first`);
    }

    const timemark: number = getCurrentTimemark();

    this._focusedTimer!.onUnfocus(timemark);
    this._focusedTimer!.onStop(timemark);
    this._focusedTimers.pop();

    if (this._focusedTimers.length > 0) {
      this._focusedTimer = this._focusedTimers[this._focusedTimers.length - 1];
      this._focusedTimer.onFocus(timemark);
    }
  }

  public get allTimers(): ReadonlyArray<ProfileTimer> {
    return this._timers;
  }

  public getTimer(timerId: TTimerId): ProfileTimer {
    return this.getTimerInternal(timerId);
  }

  private getTimerInternal(timerId: TTimerId): ProfileTimerInternal {
    let profileTimer: ProfileTimerInternal | undefined = this._timersByName.get(timerId);
    if (!profileTimer) {
      profileTimer = new ProfileTimerInternal(this, timerId);
      this._timersByName.set(profileTimer.timerId, profileTimer);
      this._timers.push(profileTimer);
    }
    return profileTimer;
  }
}
