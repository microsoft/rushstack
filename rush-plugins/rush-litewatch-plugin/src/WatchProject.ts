// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminal } from '@rushstack/terminal';

export enum WatchState {
  /** No output received yet */
  Start = 'Start',
  Building = 'Building',
  Succeeded = 'Succeeded',
  Failed = 'Failed'
}

export class WatchProject {
  public readonly name: string;
  private _state: WatchState = WatchState.Start;

  public readonly dependencies: WatchProject[] = [];
  public readonly consumers: WatchProject[] = [];

  private _live: boolean = false;

  public readonly bufferedLines: string[] = [];

  /**
   * Measures the maximum depth of the `consumers` tree, or `0` for a project with no consumers.
   *
   * See this reference for details:
   * https://github.com/microsoft/rushstack/blob/a13865bef9a20dab28c044be3504c7326bfe94b1/apps/rush-lib/src/logic/taskRunner/Task.ts#L72
   *
   * @remarks
   * `-1` means "not calculated yet"
   * `-2` means "calculation has started"
   */
  public criticalPathLength: number = -1;

  public constructor(name: string, dependencies?: WatchProject[]) {
    this.name = name;
    if (dependencies) {
      for (const dependency of dependencies) {
        this.dependencies.push(dependency);
        dependency.consumers.push(this);
      }
    } else {
      this._live = true;
    }
  }

  public get state(): WatchState {
    return this._state;
  }

  public get reported(): boolean {
    return this.bufferedLines.length === 0;
  }

  /**
   * A project is "live" if and only if (the transitive closure of) its dependencies have `State.Succeeded`.
   */
  public get live(): boolean {
    return this._live;
  }

  public setState(state: WatchState): void {
    if (this._state === state) {
      return;
    }
    if (this._state === WatchState.Succeeded) {
      // If we are leaving the Succeeded state, mark all the downstream consumers as dead
      if (this._live) {
        this._markDeadRecursive();
      }
    }
    this._state = state;
    if (this.state === WatchState.Succeeded) {
      // If we just entered the Succeeded state, then mark the immediate consumers as live
      if (this._live) {
        this._markLiveRecursive();
      }
    }

    if (this.state === WatchState.Building) {
      // If we just started a new build, then discard any logs accumulated from the previous iteration
      this.bufferedLines.length = 0;
    }
  }

  private _markDeadRecursive(): void {
    for (const consumer of this.consumers) {
      if (consumer._live) {
        consumer._live = false;
        consumer._markDeadRecursive();
      }
    }
  }

  private _markLiveRecursive(): void {
    for (const consumer of this.consumers) {
      consumer._live = true;
      if (consumer._state === WatchState.Succeeded) {
        consumer._markLiveRecursive();
      }
    }
  }

  public printBufferedLines(terminal: ITerminal): void {
    if (this.bufferedLines.length > 0) {
      for (const line of this.bufferedLines) {
        terminal.writeLine(line);
      }
      this.bufferedLines.length = 0;
    }
  }
}
