// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  OperationStatus,
  type IConfigurableOperation,
  type IInputsSnapshot,
  type IOperationExecutionResult,
  type IOperationGraph,
  type IOperationGraphIterationOptions,
  type Operation
} from '@microsoft/rush-lib';

import type { IOutputFolderDigest, IOutputFolderSet } from './OutputFolderDigest';
import {
  getSharedOutputFolderDigester,
  type IBackgroundOutputFolderDigests,
  type OutputFolderDigester
} from './OutputFolderDigestPool';

const PLUGIN_NAME: 'DaemonOperationOutputFingerprints' = 'DaemonOperationOutputFingerprints';

/**
 * Runs after Rush's incremental decision, which taps `configureIteration` at the default stage.
 */
const CONFIGURE_ITERATION_STAGE: number = 100;

/**
 * Runs after Rush's own `afterExecuteOperationAsync` taps, which use stages up to 1, so that the outputs are recorded
 * with the final status of the result.
 */
const RECORD_OPERATION_STAGE: number = 100;

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

/** Output folders that the digester's worker threads walk while the inputs are reconciled. */
interface IEarlyWalk {
  readonly digests: IBackgroundOutputFolderDigests;
  readonly folderSets: ReadonlyArray<IOutputFolderSet>;
  /** The index of each walked operation's folder set. */
  readonly indexByOperation: ReadonlyMap<Operation, number>;
  /** The inputs snapshot of the reconciliation that started the walk, once that reconciliation succeeded. */
  inputsSnapshot: IInputsSnapshot | undefined;
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
 *   over a pool of worker threads (see {@link OutputFolderDigester}), and the pool walks the folders that
 *   the last iteration walked while the inputs are reconciled (see `walkWhileReconcilingAsync`).
 *
 * Both record the outputs of a result when Rush reports it, before any consumer of the operation starts, so that
 * a change that is made while the rest of the iteration runs is found by the next request.
 */
export class OperationOutputFingerprints {
  readonly #digester: OutputFolderDigester;
  readonly #fingerprints: Map<Operation, IOutputFingerprint> = new Map();
  readonly #graph: IOperationGraph;
  /** The operations whose output folders the last iteration walked. The next one probably walks them again. */
  #lastWalkedOperations: Set<Operation> = new Set();
  #earlyWalk: IEarlyWalk | undefined;
  /** The walks of results that this iteration recorded when Rush reported them, one folder set at a time. */
  #recordedWalkCount: number = 0;
  #recordedWalkMs: number = 0;

  public constructor(graph: IOperationGraph, digester: OutputFolderDigester = getSharedOutputFolderDigester()) {
    this.#digester = digester;
    this.#graph = graph;
    graph.hooks.configureIteration.tap(
      { name: PLUGIN_NAME, stage: CONFIGURE_ITERATION_STAGE },
      (
        currentStates: ReadonlyMap<Operation, IConfigurableOperation>,
        lastResults: ReadonlyMap<Operation, IOperationExecutionResult>,
        context: IOperationGraphIterationOptions
      ) => {
        this.#enableOperationsWithChangedContents(currentStates, this.#takeEarlyWalk(context));
      }
    );
    graph.hooks.afterExecuteOperationAsync.tap(
      { name: PLUGIN_NAME, stage: RECORD_OPERATION_STAGE },
      (record: IOperationExecutionResult) => this.#recordOperation(record)
    );
    graph.hooks.afterExecuteIterationAsync.tap(
      PLUGIN_NAME,
      (status: OperationStatus, records: ReadonlyMap<Operation, IOperationExecutionResult>) => {
        this.#recordIteration(records);
        return status;
      }
    );
    graph.abortController.signal.addEventListener('abort', () => this.#takeEarlyWalk()?.digests.cancel(), {
      once: true
    });
  }

  /**
   * Runs a reconciliation of the inputs while the digester's worker threads walk the output folders that the
   * last iteration walked, so that the next iteration's content check can use those digests instead of walking.
   *
   * @remarks
   * Only an iteration that uses the inputs snapshot of this reconciliation uses the digests. Every request
   * that such an iteration serves was received before the reconciliation started, so the walks see each change
   * that was made before one of those requests was sent, as the inputs snapshot does. A later change can be
   * missed, as it can by the inputs snapshot, and the next request finds it: an operation keeps its recorded
   * fingerprint until it produces a new result. No operation writes its outputs during the walks, because the
   * daemon reconciles only while no iteration runs, including work that continues after an early result.
   */
  public async walkWhileReconcilingAsync<TResult extends { readonly inputsSnapshot: IInputsSnapshot }>(
    reconcileAsync: () => Promise<TResult>
  ): Promise<TResult> {
    this.#takeEarlyWalk()?.digests.cancel();
    const earlyWalk: IEarlyWalk | undefined = this.#graph.abortController.signal.aborted
      ? undefined
      : this.#startEarlyWalk();
    this.#earlyWalk = earlyWalk;
    try {
      const result: TResult = await reconcileAsync();
      if (earlyWalk) {
        earlyWalk.inputsSnapshot = result.inputsSnapshot;
      }
      return result;
    } catch (error) {
      if (earlyWalk && this.#earlyWalk === earlyWalk) {
        this.#takeEarlyWalk()?.digests.cancel();
      }
      throw error;
    }
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
  #enableOperationsWithChangedContents(
    currentStates: ReadonlyMap<Operation, IConfigurableOperation>,
    earlyWalk: IEarlyWalk | undefined
  ): void {
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
    this.#lastWalkedOperations = new Set(checks.map(({ operation }: ISkipCheck) => operation));
    const digests: IOutputFolderDigest[] = this.#digestLargestFirst(checks, earlyWalk);
    checks.forEach(({ operation, state, contentFingerprint }: ISkipCheck, index: number) => {
      if (digests[index].digest !== contentFingerprint) {
        enableOperation(operation, state);
      }
    });
  }

  /**
   * Records the stat fingerprint and the content digest of the outputs of a result that the graph will retain, and
   * that allows it to skip the operation later. Rush reports a result before any consumer of the operation starts,
   * so the outputs are recorded as the operation left them.
   */
  #recordOperation(record: IOperationExecutionResult): void {
    const { operation, status } = record;
    // The graph retains a skipped result only for an operation that it selected.
    if (!TRACKED_STATUSES.has(status) || (status === OperationStatus.Skipped && !record.enabled)) {
      return;
    }
    const fingerprint: string | undefined = getOutputFingerprint(operation);
    const folderSet: IOutputFolderSet | undefined = getOutputFolderSet(operation);
    if (fingerprint === undefined || folderSet === undefined) {
      this.#fingerprints.delete(operation);
      return;
    }
    const startTimeMs: number = performance.now();
    const [{ digest: contentFingerprint, entryCount }] = this.#digester.digest([folderSet]);
    this.#recordedWalkMs += performance.now() - startTimeMs;
    this.#recordedWalkCount++;
    this.#fingerprints.set(operation, { record, fingerprint, contentFingerprint, entryCount });
    this.#lastWalkedOperations.add(operation);
  }

  /**
   * Records the outputs of each retained result that was not recorded when Rush reported it, and lets the digester
   * start its pool if this iteration's walks took long enough together.
   */
  #recordIteration(records: ReadonlyMap<Operation, IOperationExecutionResult>): void {
    const walks: IRecordWalk[] = [];
    for (const [operation, record] of records) {
      // Only records produced by this iteration become the retained result; disabled operations keep
      // their earlier record and fingerprint.
      if (this.#isRetained(operation, record) && this.#fingerprints.get(operation)?.record !== record) {
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
      this.#lastWalkedOperations.add(operation);
    });
    this.#digester.recordCallingThreadDigests(this.#recordedWalkCount, this.#recordedWalkMs);
    this.#recordedWalkCount = 0;
    this.#recordedWalkMs = 0;
  }

  /**
   * Starts walking the output folders that the last iteration walked, if their operations still have a
   * retained result to check.
   */
  #startEarlyWalk(): IEarlyWalk | undefined {
    const walks: IContentWalk[] = [];
    for (const operation of this.#lastWalkedOperations) {
      const entry: IOutputFingerprint | undefined = this.#fingerprints.get(operation);
      const folderSet: IOutputFolderSet | undefined = getOutputFolderSet(operation);
      if (entry?.contentFingerprint !== undefined && folderSet && this.#isRetained(operation, entry.record)) {
        walks.push({ operation, folderSet, entryCount: entry.entryCount });
      }
    }
    sortLargestFirst(walks);
    const folderSets: IOutputFolderSet[] = walks.map(({ folderSet }: IContentWalk) => folderSet);
    const digests: IBackgroundOutputFolderDigests | undefined =
      walks.length > 0 ? this.#digester.start(folderSets) : undefined;
    return (
      digests && {
        digests,
        folderSets,
        indexByOperation: new Map(
          walks.map(({ operation }: IContentWalk, index: number) => [operation, index])
        ),
        inputsSnapshot: undefined
      }
    );
  }

  /**
   * Returns the pending early walk, and forgets it. With a context, returns it only if that iteration uses the
   * inputs snapshot of the reconciliation that started the walk, and cancels it otherwise.
   */
  #takeEarlyWalk(context?: IOperationGraphIterationOptions): IEarlyWalk | undefined {
    const earlyWalk: IEarlyWalk | undefined = this.#earlyWalk;
    this.#earlyWalk = undefined;
    if (
      !earlyWalk ||
      !context ||
      (earlyWalk.inputsSnapshot !== undefined && earlyWalk.inputsSnapshot === context.inputsSnapshot)
    ) {
      return earlyWalk;
    }
    earlyWalk.digests.cancel();
    return undefined;
  }

  /**
   * Sorts the walks by their expected size, largest first, and returns their digests in that order. Uses the
   * digests of an early walk of the same folder sets where there are any, and walks the others now.
   */
  #digestLargestFirst(walks: IContentWalk[], earlyWalk?: IEarlyWalk): IOutputFolderDigest[] {
    sortLargestFirst(walks);
    const digests: (IOutputFolderDigest | undefined)[] = earlyWalk ? takeEarlyDigests(walks, earlyWalk) : [];
    const missingIndexes: number[] = [];
    for (let index: number = 0; index < walks.length; index++) {
      if (!digests[index]) {
        missingIndexes.push(index);
      }
    }
    if (missingIndexes.length > 0) {
      const missingDigests: IOutputFolderDigest[] = this.#digester.digest(
        missingIndexes.map((index: number) => walks[index].folderSet)
      );
      missingIndexes.forEach((walkIndex: number, index: number) => {
        digests[walkIndex] = missingDigests[index];
      });
    }
    return digests as IOutputFolderDigest[];
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

/**
 * Returns the digest that the early walk computed for each walk's folder set, where it computed one, and
 * stops the early walk.
 */
function takeEarlyDigests(
  walks: ReadonlyArray<IContentWalk>,
  { digests, folderSets, indexByOperation }: IEarlyWalk
): (IOutputFolderDigest | undefined)[] {
  const earlyIndexes: (number | undefined)[] = walks.map(({ operation, folderSet }: IContentWalk) => {
    const index: number | undefined = indexByOperation.get(operation);
    return index !== undefined && isSameFolderSet(folderSets[index], folderSet) ? index : undefined;
  });
  if (earlyIndexes.every((index: number | undefined) => index === undefined)) {
    digests.cancel();
    return [];
  }
  const earlyDigests: ReadonlyArray<IOutputFolderDigest | undefined> = digests.finish();
  return earlyIndexes.map((index: number | undefined) =>
    index === undefined ? undefined : earlyDigests[index]
  );
}

function sortLargestFirst(walks: IContentWalk[]): void {
  walks.sort((left: IContentWalk, right: IContentWalk) => right.entryCount - left.entryCount);
}

function isSameFolderSet(left: IOutputFolderSet, right: IOutputFolderSet): boolean {
  return (
    left.projectFolder === right.projectFolder &&
    left.folderNames.length === right.folderNames.length &&
    left.folderNames.every((folderName: string, index: number) => folderName === right.folderNames[index])
  );
}

function getOutputFolderSet(operation: Operation): IOutputFolderSet | undefined {
  const folderNames: ReadonlyArray<string> | undefined = operation.settings?.outputFolderNames;
  return folderNames?.length
    ? { projectFolder: operation.associatedProject.projectFolder, folderNames: [...folderNames] }
    : undefined;
}
