// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  OperationStatus,
  type IOperationExecutionResult,
  type IOperationGraph,
  type Operation
} from '@microsoft/rush-lib';

const PLUGIN_NAME: 'DaemonOperationOutputFingerprints' = 'DaemonOperationOutputFingerprints';

/**
 * Retained results that allow the warm graph to skip an operation. Other statuses always re-run.
 */
const TRACKED_STATUSES: ReadonlySet<OperationStatus> = new Set([
  OperationStatus.Success,
  OperationStatus.FromCache
]);

interface IOutputFingerprint {
  readonly record: IOperationExecutionResult;
  readonly fingerprint: string;
}

/**
 * Detects retained successful operations whose declared output folders were changed outside the daemon.
 *
 * @remarks
 * Build outputs are normally git-ignored, so they do not contribute to any operation state hash. Without
 * this check, deleting an output folder (`rm -rf lib`, `git clean -xdf`, `heft clean`) leaves a warm graph
 * that reports the operation as up to date. The fingerprint is deliberately cheap: one `stat` per declared
 * output folder, capturing existence, identity and modification time. This detects deletion, recreation,
 * and adding, removing or renaming direct children; it does not detect in-place edits of nested files.
 */
export class OperationOutputFingerprints {
  readonly #fingerprints: Map<Operation, IOutputFingerprint> = new Map();
  readonly #graph: IOperationGraph;

  public constructor(graph: IOperationGraph) {
    this.#graph = graph;
    graph.hooks.afterExecuteIterationAsync.tap(
      PLUGIN_NAME,
      (status: OperationStatus, records: ReadonlyMap<Operation, IOperationExecutionResult>) => {
        this.#recordIteration(records);
        return status;
      }
    );
  }

  /**
   * Returns retained successful operations whose output folders no longer match the recorded fingerprint.
   */
  public getOperationsWithChangedOutputs(): Operation[] {
    const changed: Operation[] = [];
    for (const [operation, { record, fingerprint }] of this.#fingerprints) {
      if (!this.#isRetained(operation, record)) {
        this.#fingerprints.delete(operation);
      } else if (getOutputFingerprint(operation) !== fingerprint) {
        this.#fingerprints.delete(operation);
        changed.push(operation);
      }
    }
    return changed;
  }

  #recordIteration(records: ReadonlyMap<Operation, IOperationExecutionResult>): void {
    for (const [operation, record] of records) {
      // Only records produced by this iteration become the retained result; disabled operations keep
      // their earlier record and fingerprint.
      if (this.#isRetained(operation, record)) {
        const fingerprint: string | undefined = getOutputFingerprint(operation);
        if (fingerprint === undefined) {
          this.#fingerprints.delete(operation);
        } else {
          this.#fingerprints.set(operation, { record, fingerprint });
        }
      }
    }
  }

  #isRetained(operation: Operation, record: IOperationExecutionResult): boolean {
    return this.#graph.resultByOperation.get(operation) === record && TRACKED_STATUSES.has(record.status);
  }
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
