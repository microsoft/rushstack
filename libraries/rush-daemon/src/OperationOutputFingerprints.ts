// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  OperationStatus,
  type IConfigurableOperation,
  type IOperationExecutionResult,
  type IOperationGraph,
  type Operation
} from '@microsoft/rush-lib';

import type { IOutputFolderDigest, IOutputFolderSet } from './OutputFolderDigest';
import { getSharedOutputFolderDigester, type OutputFolderDigester } from './OutputFolderDigestPool';

const PLUGIN_NAME: 'DaemonOperationOutputFingerprints' = 'DaemonOperationOutputFingerprints';

/**
 * Runs after Rush's incremental decision, which taps `configureIteration` at the default stage.
 */
const CONFIGURE_ITERATION_STAGE: number = 100;

/**
 * Retained results that allow the warm graph to skip an operation. Other statuses always re-run. The graph only
 * retains a `Skipped` result for an operation that it selected, when a plugin (e.g. change detection) found its
 * outputs up to date.
 */
const TRACKED_STATUSES: ReadonlySet<OperationStatus> = new Set([
  OperationStatus.Success,
  OperationStatus.FromCache,
  OperationStatus.Skipped
]);

interface IOutputFingerprint {
  readonly record: IOperationExecutionResult;
  readonly fingerprint: string;
  /** Undefined if the outputs could not be read when recorded; that never matches. */
  readonly contentFingerprint: string | undefined;
  /** The number of entries below the output folders when recorded. */
  readonly entryCount: number;
}

interface IContentWalk {
  readonly operation: Operation;
  readonly folderSet: IOutputFolderSet;
  /** The expected size of the walk, so that the largest walks start first. */
  readonly entryCount: number;
}

interface ISkipCheck extends IContentWalk {
  readonly state: IConfigurableOperation;
  readonly contentFingerprint: string;
}

interface IRecordWalk extends IContentWalk {
  readonly record: IOperationExecutionResult;
  readonly fingerprint: string;
}

/**
 * Detects retained successful or up-to-date operations whose declared output folders were changed outside
 * the daemon.
 *
 * @remarks
 * Build outputs are normally git-ignored, so they do not contribute to any operation state hash. Without
 * this check, a warm graph reports an operation as up to date after its outputs were deleted (`rm -rf lib`,
 * `git clean -xdf`, `heft clean`) or edited, and a consumer that runs on top of edited outputs stores them
 * in its own build cache entry. There are two checks:
 *
 * - On every reconciliation, one `stat` per declared output folder of every retained operation, capturing
 *   existence, identity and modification time. This detects deleting or recreating a folder, and adding,
 *   removing or renaming its direct children.
 *
 * - When an iteration is configured, a walk of the declared output folders of each selected operation that
 *   Rush would otherwise skip. It compares the relative path of every nested entry and the size,
 *   modification time and identity of every entry that is not a folder. This also detects in-place edits
 *   and nested additions, deletions and renames. Its cost grows with the output files of the request's
 *   selection, not with the whole warm graph. Once a walk takes long enough to matter, walks are spread
 *   over a pool of worker threads (see {@link OutputFolderDigester}).
 */
export class OperationOutputFingerprints {
  readonly #digester: OutputFolderDigester;
  readonly #fingerprints: Map<Operation, IOutputFingerprint> = new Map();
  readonly #graph: IOperationGraph;

  public constructor(graph: IOperationGraph, digester: OutputFolderDigester = getSharedOutputFolderDigester()) {
    this.#digester = digester;
    this.#graph = graph;
    graph.hooks.configureIteration.tap(
      { name: PLUGIN_NAME, stage: CONFIGURE_ITERATION_STAGE },
      (currentStates: ReadonlyMap<Operation, IConfigurableOperation>) => {
        this.#enableOperationsWithChangedContents(currentStates);
      }
    );
    graph.hooks.afterExecuteIterationAsync.tap(
      PLUGIN_NAME,
      (status: OperationStatus, records: ReadonlyMap<Operation, IOperationExecutionResult>) => {
        this.#recordIteration(records);
        return status;
      }
    );
  }

  /**
   * Returns retained operations whose output folders no longer match the recorded fingerprint.
   *
   * @remarks
   * Fingerprints of changed operations are forgotten only after all cleanup succeeded, so a failed
   * reconciliation retries the output check on the next request instead of trusting the stale result.
   */
  public getOperationsWithChangedOutputs(): Operation[] {
    const changed: Operation[] = [];
    for (const [operation, { record, fingerprint }] of this.#fingerprints) {
      if (!this.#isRetained(operation, record)) {
        this.#fingerprints.delete(operation);
      } else if (getOutputFingerprint(operation) !== fingerprint) {
        changed.push(operation);
      }
    }
    for (const operation of changed) {
      forgetLegacySkipState(operation);
    }
    for (const operation of changed) {
      this.#fingerprints.delete(operation);
    }
    return changed;
  }

  /**
   * Enables each selected operation that Rush would skip if any entry below its output folders changed.
   *
   * @remarks
   * The recorded fingerprint is kept until the operation produces a new retained result, so an iteration
   * that ends before the operation runs leaves the check in place for the next request.
   */
  #enableOperationsWithChangedContents(currentStates: ReadonlyMap<Operation, IConfigurableOperation>): void {
    const checks: ISkipCheck[] = [];
    for (const [operation, state] of currentStates) {
      if (state.enabled || !operation.enabled) {
        continue;
      }
      const entry: IOutputFingerprint | undefined = this.#fingerprints.get(operation);
      if (!entry || !this.#isRetained(operation, entry.record)) {
        continue;
      }
      const folderSet: IOutputFolderSet | undefined = getOutputFolderSet(operation);
      const { contentFingerprint, entryCount } = entry;
      if (!folderSet || contentFingerprint === undefined) {
        enableOperation(operation, state);
      } else {
        checks.push({ operation, folderSet, entryCount, state, contentFingerprint });
      }
    }
    const digests: IOutputFolderDigest[] = this.#digestLargestFirst(checks);
    checks.forEach(({ operation, state, contentFingerprint }: ISkipCheck, index: number) => {
      if (digests[index].digest !== contentFingerprint) {
        enableOperation(operation, state);
      }
    });
  }

  #recordIteration(records: ReadonlyMap<Operation, IOperationExecutionResult>): void {
    const walks: IRecordWalk[] = [];
    for (const [operation, record] of records) {
      // Only records produced by this iteration become the retained result; disabled operations keep
      // their earlier record and fingerprint.
      if (this.#isRetained(operation, record)) {
        const fingerprint: string | undefined = getOutputFingerprint(operation);
        const folderSet: IOutputFolderSet | undefined = getOutputFolderSet(operation);
        if (fingerprint === undefined || folderSet === undefined) {
          this.#fingerprints.delete(operation);
        } else {
          const entryCount: number = this.#fingerprints.get(operation)?.entryCount ?? 0;
          walks.push({ operation, folderSet, entryCount, record, fingerprint });
        }
      }
    }
    const digests: IOutputFolderDigest[] = this.#digestLargestFirst(walks);
    walks.forEach(({ operation, record, fingerprint }: IRecordWalk, index: number) => {
      const { digest: contentFingerprint, entryCount } = digests[index];
      this.#fingerprints.set(operation, { record, fingerprint, contentFingerprint, entryCount });
    });
  }

  /** Sorts the walks by their expected size, largest first, and returns their digests in that order. */
  #digestLargestFirst(walks: IContentWalk[]): IOutputFolderDigest[] {
    walks.sort((left: IContentWalk, right: IContentWalk) => right.entryCount - left.entryCount);
    return this.#digester.digest(walks.map(({ folderSet }: IContentWalk) => folderSet));
  }

  #isRetained(operation: Operation, record: IOperationExecutionResult): boolean {
    return this.#graph.resultByOperation.get(operation) === record && TRACKED_STATUSES.has(record.status);
  }
}

function enableOperation(operation: Operation, state: IConfigurableOperation): void {
  forgetLegacySkipState(operation);
  state.enabled = true;
}

/**
 * Without a build cache, Rush's legacy skip detection reports an operation as skipped when its recorded
 * input state is unchanged, even though its outputs are gone. Remove that record (as the legacy skip logic
 * does itself before executing) so the invalidated operation is executed instead.
 */
function forgetLegacySkipState(operation: Operation): void {
  fs.rmSync(
    path.join(
      operation.associatedProject.projectRushTempFolder,
      `package-deps_${operation.logFilenameIdentifier}.json`
    ),
    { force: true }
  );
}

function getOutputFingerprint(operation: Operation): string | undefined {
  const folderNames: ReadonlyArray<string> | undefined = operation.settings?.outputFolderNames;
  if (!folderNames?.length) {
    return undefined;
  }
  const { projectFolder } = operation.associatedProject;
  return folderNames
    .map((folderName: string) => {
      const stats: fs.Stats | undefined = fs.statSync(path.resolve(projectFolder, folderName), {
        throwIfNoEntry: false
      });
      return stats ? `${folderName}:${stats.ino}:${stats.mtimeMs}` : `${folderName}:missing`;
    })
    .join('|');
}

function getOutputFolderSet(operation: Operation): IOutputFolderSet | undefined {
  const folderNames: ReadonlyArray<string> | undefined = operation.settings?.outputFolderNames;
  return folderNames?.length
    ? { projectFolder: operation.associatedProject.projectFolder, folderNames: [...folderNames] }
    : undefined;
}
