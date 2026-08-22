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
  /** True at initialization, or when the watcher reported a change without a path or encountered an error. */
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
  readonly #sequenceByPath: Map<string, number> = new Map();
  #initializationSequence: number | undefined;
  #latestSequence: number = 0;
  #unknownChangeSequence: number | undefined;
  #watcherHealthy: boolean = true;

  /** Records a path-specific or unknown workspace change. */
  public invalidate(changedPath?: string): void {
    const sequence: number = ++this.#latestSequence;
    if (changedPath === undefined || this.#unknownChangeSequence !== undefined) {
      this.#unknownChangeSequence = sequence;
      return;
    }

    if (
      !this.#sequenceByPath.has(changedPath) &&
      this.#sequenceByPath.size >= MAX_TRACKED_CHANGED_PATHS
    ) {
      this.#sequenceByPath.clear();
      this.#unknownChangeSequence = sequence;
      return;
    }

    this.#sequenceByPath.set(changedPath, sequence);
  }

  /** @internal */
  public invalidateForInitialization(): void {
    this.#initializationSequence = ++this.#latestSequence;
  }

  /** @internal */
  public get hasUnattributedUnknownChanges(): boolean {
    return this.#unknownChangeSequence !== undefined;
  }

  /**
   * Permanently marks the current watcher as unhealthy.
   *
   * Unknown invalidation remains pending so consumers cannot mistake the workspace for clean.
   */
  public markWatcherUnhealthy(): void {
    if (this.#watcherHealthy) {
      this.#watcherHealthy = false;
      this.invalidate();
    }
  }

  /** Returns all changes that have not been acknowledged. */
  public getSnapshot(): IWorkspaceInvalidationSnapshot {
    return {
      changedPaths: Array.from(this.#sequenceByPath.keys()).sort(),
      hasUnknownChanges:
        this.#initializationSequence !== undefined || this.#unknownChangeSequence !== undefined,
      isWatcherHealthy: this.#watcherHealthy,
      sequence: this.#latestSequence
    };
  }

  /**
   * Acknowledges changes through a previously observed sequence.
   *
   * Changes that arrive after that sequence remain pending, including repeated changes to the same path.
   */
  public acknowledgeThrough(sequence: number): void {
    if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence > this.#latestSequence) {
      throw new RangeError(`Invalid workspace invalidation sequence: ${sequence}`);
    }

    for (const [changedPath, pathSequence] of this.#sequenceByPath) {
      if (pathSequence <= sequence) {
        this.#sequenceByPath.delete(changedPath);
      }
    }
    if (
      this.#watcherHealthy &&
      this.#unknownChangeSequence !== undefined &&
      this.#unknownChangeSequence <= sequence
    ) {
      this.#unknownChangeSequence = undefined;
    }
    if (this.#initializationSequence !== undefined && this.#initializationSequence <= sequence) {
      this.#initializationSequence = undefined;
    }
  }
}
