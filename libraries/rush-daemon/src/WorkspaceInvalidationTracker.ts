// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A point-in-time view of workspace changes that have not yet been reconciled.
 *
 * @beta
 */
export interface IWorkspaceInvalidationSnapshot {
  /** Paths reported by the watcher, sorted for deterministic consumption. */
  readonly changedPaths: ReadonlyArray<string>;
  /** True when the watcher reported a change without a path or encountered a watcher error. */
  readonly hasUnknownChanges: boolean;
  /** False after a watcher error makes subsequent change detection unreliable. */
  readonly isWatcherHealthy: boolean;
  /** The latest invalidation sequence included in this snapshot. */
  readonly sequence: number;
}

const MAX_TRACKED_CHANGED_PATHS: number = 10_000;

/**
 * Retains workspace invalidations until a future request explicitly acknowledges them.
 *
 * @beta
 */
export class WorkspaceInvalidationTracker {
  private readonly _sequenceByPath: Map<string, number> = new Map();
  private _latestSequence: number = 0;
  private _unknownChangeSequence: number | undefined;
  private _watcherHealthy: boolean = true;

  /** Records a path-specific or unknown workspace change. */
  public invalidate(changedPath?: string): void {
    const sequence: number = ++this._latestSequence;
    if (changedPath === undefined || this._unknownChangeSequence !== undefined) {
      this._unknownChangeSequence = sequence;
      return;
    }

    if (
      !this._sequenceByPath.has(changedPath) &&
      this._sequenceByPath.size >= MAX_TRACKED_CHANGED_PATHS
    ) {
      this._sequenceByPath.clear();
      this._unknownChangeSequence = sequence;
      return;
    }

    this._sequenceByPath.set(changedPath, sequence);
  }

  /**
   * Permanently marks the current watcher as unhealthy.
   *
   * Unknown invalidation remains pending so consumers cannot mistake the workspace for clean.
   */
  public markWatcherUnhealthy(): void {
    if (this._watcherHealthy) {
      this._watcherHealthy = false;
      this.invalidate();
    }
  }

  /** Returns all changes that have not been acknowledged. */
  public getSnapshot(): IWorkspaceInvalidationSnapshot {
    return {
      changedPaths: Array.from(this._sequenceByPath.keys()).sort(),
      hasUnknownChanges: this._unknownChangeSequence !== undefined,
      isWatcherHealthy: this._watcherHealthy,
      sequence: this._latestSequence
    };
  }

  /**
   * Acknowledges changes through a previously observed sequence.
   *
   * Changes that arrive after that sequence remain pending, including repeated changes to the same path.
   */
  public acknowledgeThrough(sequence: number): void {
    if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence > this._latestSequence) {
      throw new RangeError(`Invalid workspace invalidation sequence: ${sequence}`);
    }

    for (const [changedPath, pathSequence] of this._sequenceByPath) {
      if (pathSequence <= sequence) {
        this._sequenceByPath.delete(changedPath);
      }
    }
    if (
      this._watcherHealthy &&
      this._unknownChangeSequence !== undefined &&
      this._unknownChangeSequence <= sequence
    ) {
      this._unknownChangeSequence = undefined;
    }
  }
}
