// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';
import fs from 'node:fs/promises';
import type { Stats } from 'node:fs';

import { FileSystem, type FolderItem } from '@rushstack/node-core-library';

import type { IShardResultManifest } from './IShardResultManifest';
import { getShardFolderName, getShardTaskFolderPath } from './ShardIdentity';
import {
  getShardManifestPath,
  tryReadShardResultManifestAsync,
  validateShardResultManifest
} from './ShardResultManifest';

/**
 * The independently supplied context for the sharded run being collated.
 * @public
 */
export interface IShardCollationRequest {
  /** The folder containing one subfolder per shard. */
  shardParentFolderPath: string;
  /** The number of shards scheduled for this invocation. */
  shardCount: number;
  /** One folder-name component containing exactly one `{shardIndex}` token. */
  shardFolderNameTemplate: string;
  /** The configured producer phase, not the collation task's phase or action alias. */
  producerPhaseName: string;
  /** The configured producer task within that phase. */
  producerTaskName: string;
}

/**
 * A complete set of shard results with a coherent workload-neutral envelope.
 * @public
 */
export interface IShardCollationResult {
  /** Every shard's manifest, ordered by `shardIndex`. */
  manifests: readonly IShardResultManifest[];
  /** The validated producer phase shared by all manifests. */
  phaseName: string;
  /** The total number of problems reported across all shards. */
  diagnosticCount: number;
  /** The total number of units of work processed across all shards. */
  itemCount: number;
  /**
   * Whether the manifests report zero diagnostics.
   * Workload consumers must also validate payloads and apply their empty-workload policy.
   */
  passed: boolean;
}

/**
 * Raised when shard results cannot be proven coherent.
 * @public
 */
export class ShardCoherenceError extends Error {
  /** The problems found, in deterministic order. */
  public readonly violations: readonly string[];

  public constructor(violations: readonly string[]) {
    const sortedViolations: string[] = [...violations].sort();
    super(
      'The sharded run did not produce a coherent set of results, so its output cannot be trusted:\n' +
        sortedViolations.map((violation: string) => `  - ${violation}`).join('\n')
    );
    this.violations = sortedViolations;
  }
}

/**
 * Reads the addressed producer task's manifests from the declared shard slots in folder-name order.
 *
 * @remarks
 * Missing folders/manifests are omitted so {@link validateShardResults} can identify missing shards.
 * Corrupt manifests, filesystem errors other than absence, and symbolic links/junctions at the
 * parent or addressed task path are rejected. Unrelated folders and loose files are ignored.
 * Manifests must be regular files, and their index must match the containing slot.
 * Callers must resolve and validate ancestors of the parent against their build root and keep
 * inputs stable throughout collation; this is not protection against concurrent filesystem mutation.
 *
 * @public
 */
export async function readShardResultsAsync(
  request: IShardCollationRequest,
  abortSignal?: AbortSignal
): Promise<IShardResultManifest[]> {
  abortSignal?.throwIfAborted();
  const { shardParentFolderPath, shardFolderNameTemplate, producerPhaseName, producerTaskName } = request;
  _validateShardCount(request.shardCount);
  getShardFolderName(1, shardFolderNameTemplate);
  getShardTaskFolderPath('shards', producerPhaseName, producerTaskName);
  const [prefix, suffix] = shardFolderNameTemplate.split('{shardIndex}');
  let folderItems: FolderItem[];
  try {
    const parentStats: Stats = await fs.lstat(shardParentFolderPath);
    abortSignal?.throwIfAborted();
    if (parentStats.isSymbolicLink()) {
      throw new Error(`Shard inputs must not be symbolic links: "${shardParentFolderPath}".`);
    }
    folderItems = await FileSystem.readFolderItemsAsync(shardParentFolderPath);
    abortSignal?.throwIfAborted();
  } catch (error) {
    abortSignal?.throwIfAborted();
    if (FileSystem.isNotExistError(error as Error)) {
      return [];
    }
    throw error;
  }

  folderItems.sort((x: FolderItem, y: FolderItem) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
  const manifests: IShardResultManifest[] = [];
  for (const folderItem of folderItems) {
    abortSignal?.throwIfAborted();
    if (!folderItem.name.startsWith(prefix) || !folderItem.name.endsWith(suffix)) continue;
    const indexText: string = folderItem.name.slice(prefix.length, folderItem.name.length - suffix.length);
    if (!/^[1-9]\d*$/.test(indexText)) continue;
    const shardIndex: number = Number(indexText);
    if (!Number.isSafeInteger(shardIndex) || shardIndex > request.shardCount) continue;
    if (getShardFolderName(shardIndex, shardFolderNameTemplate) !== folderItem.name) continue;
    if (folderItem.isSymbolicLink()) {
      throw new Error(`Shard inputs must not be symbolic links: "${folderItem.name}".`);
    }
    if (!folderItem.isDirectory()) {
      continue;
    }

    const slotPath: string = path.join(shardParentFolderPath, folderItem.name);
    const folderPath: string = path.join(
      shardParentFolderPath,
      getShardTaskFolderPath(folderItem.name, producerPhaseName, producerTaskName)
    );
    const manifestPath: string = getShardManifestPath(folderPath);
    try {
      for (const directory of [path.join(slotPath, producerPhaseName), folderPath]) {
        const stats: Stats = await fs.lstat(directory);
        abortSignal?.throwIfAborted();
        if (stats.isSymbolicLink()) {
          throw new Error(`Shard inputs must not be symbolic links: "${directory}".`);
        }
      }
      const manifestStats: Stats = await fs.lstat(manifestPath);
      abortSignal?.throwIfAborted();
      if (manifestStats.isSymbolicLink()) {
        throw new Error(`Shard inputs must not be symbolic links: "${manifestPath}".`);
      }
      if (!manifestStats.isFile()) {
        throw new Error(`Shard manifests must be regular files: "${manifestPath}".`);
      }
    } catch (error) {
      abortSignal?.throwIfAborted();
      if (!FileSystem.isNotExistError(error as Error)) throw error;
      continue;
    }
    const manifest: IShardResultManifest | undefined = await tryReadShardResultManifestAsync(folderPath);
    abortSignal?.throwIfAborted();
    if (manifest) {
      if (manifest.shardIndex !== shardIndex) {
        throw new ShardCoherenceError([
          `slot "${folderItem.name}" contains a result for shard ${manifest.shardIndex}, not shard ${shardIndex}`
        ]);
      }
      manifests.push(manifest);
    }
  }
  abortSignal?.throwIfAborted();
  return manifests;
}

function _formatShards(shardIndexes: readonly number[]): string {
  const sorted: number[] = [...shardIndexes].sort((x: number, y: number) => {
    if (Number.isNaN(x)) return Number.isNaN(y) ? 0 : 1;
    if (Number.isNaN(y)) return -1;
    return x - y;
  });
  return `${sorted.length === 1 ? 'shard' : 'shards'} ${sorted.join(', ')}`;
}

function _validateShardCount(shardCount: number): void {
  if (!Number.isSafeInteger(shardCount) || shardCount < 1) {
    throw new Error(
      `The shard count must be a positive integer in the safe integer range, but it was ${shardCount}.`
    );
  }
}

/**
 * Proves that manifests represent one complete, self-consistent run.
 *
 * @remarks
 * The orchestrator is responsible for selecting compatible cached artifacts. Results from different
 * executions may be combined; invocation identity and timestamps are not freshness requirements.
 * Payloads remain opaque; a successful envelope verdict alone is not a workload verdict.
 *
 * @throws {@link ShardCoherenceError} if the results cannot be trusted.
 * @public
 */
export function validateShardResults(
  manifests: readonly IShardResultManifest[],
  shardCount: number,
  producerPhaseName: string
): IShardCollationResult {
  _validateShardCount(shardCount);
  getShardTaskFolderPath('shards', producerPhaseName, 'task');
  const violations: string[] = [];
  const malformedCounts: string[] = [];
  const invalidIndexes: number[] = [];
  const manifestsByIndex: Map<number, IShardResultManifest[]> = new Map();
  const shardIndexesByReportedCount: Map<number, number[]> = new Map();
  const phaseMismatchIndexes: number[] = [];
  const harnessFailureIndexes: number[] = [];
  let diagnosticCount: number = 0;
  let itemCount: number = 0;

  for (const manifest of manifests) {
    if (!Number.isSafeInteger(manifest.shardIndex) || manifest.shardIndex < 1) {
      invalidIndexes.push(manifest.shardIndex);
    }
    if (!Number.isSafeInteger(manifest.diagnosticCount) || manifest.diagnosticCount < 0) {
      malformedCounts.push(
        `shard ${manifest.shardIndex} reported a diagnostic count of ${manifest.diagnosticCount}`
      );
    }
    if (!Number.isSafeInteger(manifest.itemCount) || manifest.itemCount < 0) {
      malformedCounts.push(`shard ${manifest.shardIndex} reported an item count of ${manifest.itemCount}`);
    }

    const group: IShardResultManifest[] = manifestsByIndex.get(manifest.shardIndex) ?? [];
    group.push(manifest);
    manifestsByIndex.set(manifest.shardIndex, group);

    if (manifest.phaseName !== producerPhaseName) phaseMismatchIndexes.push(manifest.shardIndex);
    if (manifest.shardCount !== shardCount) {
      const countGroup: number[] = shardIndexesByReportedCount.get(manifest.shardCount) ?? [];
      countGroup.push(manifest.shardIndex);
      shardIndexesByReportedCount.set(manifest.shardCount, countGroup);
    }
    if (manifest.status === 'harness-failure') {
      harnessFailureIndexes.push(manifest.shardIndex);
    }
    diagnosticCount += manifest.diagnosticCount;
    itemCount += manifest.itemCount;
  }

  if (invalidIndexes.length > 0) {
    violations.push(
      `${invalidIndexes.length === 1 ? 'a result reports' : 'results report'} an invalid shard ` +
        `index of ${invalidIndexes.map(String).sort().join(', ')}`
    );
  }
  violations.push(...malformedCounts);

  const presentIndexes: number[] = [...manifestsByIndex.keys()]
    .filter((index: number) => Number.isSafeInteger(index) && index >= 1 && index <= shardCount)
    .sort((a: number, b: number) => a - b);
  const missingIndexes: string[] = [];
  let previousIndex: number = 0;
  const addMissingRange: (first: number, last: number) => void = (first, last) => {
    if (last - first >= 10) {
      missingIndexes.push(`${first}-${last}`);
    } else {
      for (let missing: number = first; missing <= last; missing++) {
        missingIndexes.push(String(missing));
      }
    }
  };
  // Bound work and diagnostics by actual inputs, not the scheduled count.
  for (const index of presentIndexes) {
    addMissingRange(previousIndex + 1, index - 1);
    previousIndex = index;
  }
  addMissingRange(previousIndex + 1, shardCount);
  if (missingIndexes.length > 0) {
    violations.push(
      `no result was found for ${shardCount - presentIndexes.length === 1 ? 'shard' : 'shards'} ` +
        `${missingIndexes.join(', ')} of ${shardCount}`
    );
  }

  for (const [shardIndex, group] of manifestsByIndex) {
    if (group.length > 1) {
      violations.push(`${group.length} results claim to be shard ${shardIndex}`);
    }
    if (shardIndex > shardCount) {
      violations.push(`a result claims to be shard ${shardIndex}, but only ${shardCount} were scheduled`);
    }
  }
  if (phaseMismatchIndexes.length > 0) {
    violations.push(
      `${_formatShards(phaseMismatchIndexes)} do not report producer phase "${producerPhaseName}"`
    );
  }
  if (
    malformedCounts.length === 0 &&
    (!Number.isSafeInteger(diagnosticCount) || !Number.isSafeInteger(itemCount))
  ) {
    violations.push('the combined shard counters exceed the safe integer range');
  }
  for (const [reportedCount, shardIndexes] of shardIndexesByReportedCount) {
    violations.push(
      `${shardCount} shards were scheduled, but ${_formatShards(shardIndexes)} ran as part of a ` +
        `${reportedCount}-shard run`
    );
  }
  if (harnessFailureIndexes.length > 0) {
    violations.push(`${_formatShards(harnessFailureIndexes)} failed to run at all`);
  }

  if (violations.length > 0) {
    throw new ShardCoherenceError(violations);
  }
  // In-memory callers need the same envelope validation as manifests read from disk.
  for (const manifest of manifests) {
    try {
      validateShardResultManifest(manifest, `Shard ${manifest.shardIndex} result manifest`);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      violations.push(error.message);
    }
  }
  if (violations.length > 0) {
    throw new ShardCoherenceError(violations);
  }
  const sortedManifests: IShardResultManifest[] = [...manifests].sort(
    (x: IShardResultManifest, y: IShardResultManifest) => x.shardIndex - y.shardIndex
  );
  return {
    manifests: sortedManifests,
    phaseName: producerPhaseName,
    diagnosticCount,
    itemCount,
    passed: diagnosticCount === 0
  };
}

/**
 * Reads the explicitly addressed task manifests and proves complete partition and phase coherence.
 * @throws {@link ShardCoherenceError} if the results cannot be trusted.
 * @public
 */
export async function loadShardResultsAsync(
  request: IShardCollationRequest,
  abortSignal?: AbortSignal
): Promise<IShardCollationResult> {
  abortSignal?.throwIfAborted();
  _validateShardCount(request.shardCount);
  const manifests: IShardResultManifest[] = await readShardResultsAsync(request, abortSignal);
  abortSignal?.throwIfAborted();
  return validateShardResults(manifests, request.shardCount, request.producerPhaseName);
}
