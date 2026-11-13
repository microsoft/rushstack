// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'node:fs/promises';
import fsSync, { type BigIntStats } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { setTimeout as sleepAsync } from 'node:timers/promises';

import { FileSystem } from '@rushstack/node-core-library';

import { validateShardPathAsync } from './ShardFileSystem';

// Keep the protocol namespace stable across workload adapters so they contend on the same claims.
export const SHARD_OUTPUT_OWNERSHIP_FOLDER_NAME: '.heft-jest-shard-locks' = '.heft-jest-shard-locks';

export type ShardOutputClaimState = 'held' | 'publishing' | 'revoked' | 'released';

export interface IShardOutputOwner {
  project?: string;
  phase?: string;
  task?: string;
  shardIndex?: number;
  shardCount?: number;
  generation?: string;
}

export interface IShardOutputLock {
  readonly filePath: string;
  readonly attemptId: string;
  readonly state: ShardOutputClaimState;
  readonly isReleased: boolean;
  assertOwned(): void;
  /** Synchronously fence and promote a staged file without an await between check and rename. */
  commit(action: () => void): void;
  /** Revocation prevents new publication but retains the claim until all work and cleanup settle. */
  revoke(): void;
  release(): void;
}

interface IOutputClaim extends IShardOutputOwner {
  version: 2;
  kind: 'registration' | 'output';
  destination: string;
  attemptId: string;
  host: string;
  pid: number;
  processStartedAt: string;
  acquiredAt: string;
}

const PROCESS_STARTED_AT: string = new Date(Date.now() - process.uptime() * 1000).toISOString();
const RECOVERY_GUIDANCE: string =
  'Use distinct output directories for distinct operations. For an abandoned claim, remove the ownership file only ' +
  'after confirming all processes of its owning operation have exited and pending writes have settled. ' +
  'Never steal a claim based only on PID or age; never clean active ownership files or include them in shard caches.';

/** Resolve existing ancestors without materializing missing input directories or result files. */
export async function resolveShardPathAsync(filename: string): Promise<string> {
  try {
    return await fs.realpath(filename);
  } catch (error) {
    if (!FileSystem.isNotExistError(error as Error)) throw error;
    return path.join(await resolveShardPathAsync(path.dirname(filename)), path.basename(filename));
  }
}

export function getShardOutputIdentity(buildFolderPath: string, outputPath: string): string {
  const relative: string = path.relative(buildFolderPath, outputPath);
  const identity: string = relative.normalize('NFC');
  if (!identity || identity === '..' || identity.startsWith(`..${path.sep}`) || path.isAbsolute(identity)) {
    throw new Error(`Managed shard output must be below the build folder: "${outputPath}".`);
  }
  const reservedIdentity: string = identity.toLowerCase();
  if (
    reservedIdentity === SHARD_OUTPUT_OWNERSHIP_FOLDER_NAME ||
    reservedIdentity.startsWith(`${SHARD_OUTPUT_OWNERSHIP_FOLDER_NAME}${path.sep}`)
  ) {
    throw new Error(
      `Managed shard output must not use the reserved "${SHARD_OUTPUT_OWNERSHIP_FOLDER_NAME}" directory.`
    );
  }
  return identity;
}

async function isFileSystemCaseSensitiveAsync(folderPath: string): Promise<boolean> {
  if (process.platform === 'win32') return false;
  const aliasPath: string = path.join(path.dirname(folderPath), path.basename(folderPath).toUpperCase());
  try {
    await fs.realpath(aliasPath);
    return false;
  } catch (error) {
    if (FileSystem.isNotExistError(error as Error)) return true;
    throw error;
  }
}

async function areFileNamesEquivalentAsync(
  probeParentPath: string,
  first: string,
  second: string
): Promise<boolean> {
  if (first === second) return true;
  const probePath: string = await fs.mkdtemp(path.join(probeParentPath, '.heft-shard-name-probe-'));
  try {
    await fs.mkdir(path.join(probePath, first));
    try {
      await fs.lstat(path.join(probePath, second));
      return true;
    } catch (error) {
      if (FileSystem.isNotExistError(error as Error)) return false;
      throw error;
    }
  } finally {
    await fs.rm(probePath, { recursive: true, force: true });
  }
}

async function doShardOutputIdentitiesOverlapAsync(
  probeParentPath: string,
  first: string,
  second: string,
  caseSensitive: boolean
): Promise<boolean> {
  const firstSegments: string[] = first.split(path.sep);
  const secondSegments: string[] = second.split(path.sep);
  const sharedLength: number = Math.min(firstSegments.length, secondSegments.length);
  for (let index: number = 0; index < sharedLength; index++) {
    const equivalent: boolean = caseSensitive
      ? firstSegments[index] === secondSegments[index]
      : await areFileNamesEquivalentAsync(probeParentPath, firstSegments[index], secondSegments[index]);
    if (!equivalent) return false;
  }
  return true;
}

function gateContentionError(filePath: string, retryCount: number, deadline: number): Error {
  return new Error(
    `Timed out waiting to register managed shard output ownership through "${filePath}". ` +
      `state=retry-exhausted retryCount=${retryCount} retryDeadline=${new Date(deadline).toISOString()}. ` +
      describeHolder(filePath) +
      ' ' +
      RECOVERY_GUIDANCE
  );
}

function isOutputClaim(value: unknown): value is IOutputClaim {
  if (!value || typeof value !== 'object') return false;
  const claim: Partial<IOutputClaim> = value;
  return (
    claim.version === 2 &&
    (claim.kind === 'registration' || claim.kind === 'output') &&
    typeof claim.destination === 'string' &&
    typeof claim.attemptId === 'string' &&
    claim.attemptId.length > 0 &&
    typeof claim.host === 'string' &&
    typeof claim.pid === 'number' &&
    Number.isSafeInteger(claim.pid) &&
    claim.pid > 0 &&
    typeof claim.processStartedAt === 'string' &&
    Number.isFinite(Date.parse(claim.processStartedAt)) &&
    typeof claim.acquiredAt === 'string' &&
    Number.isFinite(Date.parse(claim.acquiredAt)) &&
    [claim.project, claim.phase, claim.task, claim.generation].every(
      (field) => field === undefined || typeof field === 'string'
    ) &&
    [claim.shardIndex, claim.shardCount].every(
      (field) =>
        field === undefined || (typeof field === 'number' && Number.isSafeInteger(field) && field > 0)
    )
  );
}

function describeHolder(filePath: string): string {
  try {
    const stats: BigIntStats = fsSync.lstatSync(filePath, { bigint: true });
    if (!stats.isFile() || stats.nlink !== 1n) return 'Holder metadata is not a singly linked regular file.';
    const value: unknown = JSON.parse(fsSync.readFileSync(filePath, 'utf8'));
    if (!isOutputClaim(value))
      return 'Holder metadata is malformed or from an older runtime; do not reclaim automatically.';
    return `holder=${JSON.stringify({
      project: value.project,
      phase: value.phase,
      task: value.task,
      shardIndex: value.shardIndex,
      shardCount: value.shardCount,
      generation: value.generation,
      attemptId: value.attemptId,
      destination: value.destination,
      host: value.host,
      pid: value.pid,
      processStartedAt: value.processStartedAt,
      acquiredAt: value.acquiredAt,
      claimAgeMs: Math.max(0, Date.now() - Date.parse(value.acquiredAt))
    })}`;
  } catch (error) {
    return `Holder metadata could not be read: ${String(error)}.`;
  }
}

/**
 * Materialize directories, never result files, before deriving ownership. Promise realpath
 * uses native Windows semantics, including 8.3 aliases; the JS realpathSync implementation does not.
 */
export async function resolveShardOutputPathAsync(
  buildFolderPath: string,
  outputPath: string,
  directory: boolean
): Promise<string> {
  getShardOutputIdentity(buildFolderPath, outputPath);
  await validateShardPathAsync(buildFolderPath, outputPath);
  const realBuild: string = await fs.realpath(buildFolderPath);
  const target: string = path.resolve(realBuild, path.relative(buildFolderPath, outputPath));
  const parent: string = directory ? target : path.dirname(target);
  await fs.mkdir(parent, { recursive: true });
  const realParent: string = await fs.realpath(parent);
  let canonical: string = realParent;
  if (!directory) {
    canonical = path.join(realParent, path.basename(target));
    try {
      canonical = await fs.realpath(canonical);
    } catch (error) {
      if (!FileSystem.isNotExistError(error as Error)) throw error;
    }
  }
  await validateShardPathAsync(realBuild, canonical);
  getShardOutputIdentity(realBuild, canonical);
  return canonical;
}

function ownershipError(filePath: string): Error {
  return new Error(
    `Managed shard output is already owned by another task or process, or an interrupted owner left "${filePath}". ` +
      'state=contended retryCount=0 (destination conflicts fail immediately). ' +
      describeHolder(filePath) +
      ' ' +
      RECOVERY_GUIDANCE
  );
}

/** No PID inference or stale-lock deletion: unlinking an open file can steal a live Windows owner's output. */
function acquireOutputLock(
  filePath: string,
  claim: IOutputClaim,
  reportContention: boolean = true,
  abortSignal?: AbortSignal
): IShardOutputLock {
  let descriptor: number;
  try {
    descriptor = fsSync.openSync(filePath, 'wx');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || !reportContention) throw error;
    throw ownershipError(filePath);
  }
  let identity: BigIntStats;
  try {
    identity = fsSync.fstatSync(descriptor, { bigint: true });
  } catch (error) {
    const errors: unknown[] = [error];
    try {
      fsSync.unlinkSync(filePath);
    } catch (unlinkError) {
      if (!FileSystem.isNotExistError(unlinkError as Error)) errors.push(unlinkError);
    }
    try {
      fsSync.closeSync(descriptor);
    } catch (closeError) {
      errors.push(closeError);
    }
    if (errors.length === 1) throw error;
    throw new AggregateError(
      errors,
      `Failed to inspect and clean up managed shard ownership: "${filePath}".`
    );
  }
  let released: boolean = false;
  let revoked: boolean = false;
  let publishing: boolean = false;
  const revoke = (): void => {
    revoked = true;
  };
  const assertIdentity = (): void => {
    if (released) throw new Error(`Managed shard ownership was already released: "${filePath}".`);
    const current: BigIntStats = fsSync.lstatSync(filePath, { bigint: true });
    if (
      !current.isFile() ||
      current.nlink !== 1n ||
      // Windows lstat reports dev=0, whereas fstat reports the volume serial number.
      (process.platform !== 'win32' && current.dev !== identity.dev) ||
      current.ino !== identity.ino
    ) {
      throw new Error(`Managed shard ownership file changed while in use: "${filePath}".`);
    }
  };
  const assertOwned = (): void => {
    assertIdentity();
    if (revoked) throw new Error(`Shard attempt "${claim.attemptId}" was revoked: "${filePath}".`);
  };
  const lock: IShardOutputLock = {
    filePath,
    attemptId: claim.attemptId,
    get state(): ShardOutputClaimState {
      return released ? 'released' : revoked ? 'revoked' : publishing ? 'publishing' : 'held';
    },
    get isReleased(): boolean {
      return released;
    },
    assertOwned,
    revoke,
    commit: (action) => {
      assertOwned();
      if (publishing) throw new Error(`Shard attempt is already publishing: "${filePath}".`);
      publishing = true;
      try {
        action();
      } finally {
        publishing = false;
      }
    },
    release: () => {
      if (released) throw new Error(`Managed shard ownership was already released: "${filePath}".`);
      if (publishing) throw new Error(`Cannot release a publishing shard claim: "${filePath}".`);
      revoke();
      try {
        assertIdentity();
      } finally {
        fsSync.closeSync(descriptor);
        released = true;
        abortSignal?.removeEventListener('abort', revoke);
      }
      fsSync.unlinkSync(filePath);
    }
  };
  try {
    fsSync.writeFileSync(filePath, JSON.stringify(claim));
  } catch (error) {
    try {
      lock.release();
    } catch (releaseError) {
      throw new AggregateError(
        [error, releaseError],
        `Failed to write and release shard claim "${filePath}".`
      );
    }
    throw error;
  }
  abortSignal?.addEventListener('abort', revoke, { once: true });
  if (abortSignal?.aborted) revoke();
  return lock;
}

export function releaseShardOutputLocks(locks: Iterable<IShardOutputLock>): void {
  const errors: unknown[] = [];
  for (const lock of locks) {
    try {
      lock.release();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) throw new AggregateError(errors, 'Failed to release managed shard output ownership.');
}

/**
 * Claim canonical destinations, including their descendants. A short registration gate makes
 * overlap checking and multi-output acquisition atomic across processes. It is never held during
 * workload execution. An abandoned gate, like an abandoned output claim, requires manual recovery.
 * Call resolveShardOutputPathAsync() first for every destination; this function does not resolve aliases.
 * Callers must also keep outputs separate from source files and other inputs.
 */
export async function acquireShardOutputLocksAsync(
  buildFolderPath: string,
  outputPaths: Iterable<string>,
  owner: IShardOutputOwner = {},
  abortSignal?: AbortSignal
): Promise<IShardOutputLock[]> {
  const realBuild: string = await fs.realpath(buildFolderPath);
  const lockFolder: string = path.join(realBuild, SHARD_OUTPUT_OWNERSHIP_FOLDER_NAME);
  await validateShardPathAsync(realBuild, lockFolder);
  await fs.mkdir(lockFolder, { recursive: true });
  const caseSensitive: boolean = await isFileSystemCaseSensitiveAsync(lockFolder);
  const destinations: string[] = [];
  const exactDestinations: Set<string> = new Set();
  for (const output of outputPaths) {
    const destination: string = getShardOutputIdentity(realBuild, output);
    if (!exactDestinations.has(destination)) {
      exactDestinations.add(destination);
      destinations.push(destination);
    }
  }
  for (let currentIndex: number = 0; currentIndex < destinations.length; currentIndex++) {
    for (let previousIndex: number = 0; previousIndex < currentIndex; previousIndex++) {
      if (
        await doShardOutputIdentitiesOverlapAsync(
          lockFolder,
          destinations[previousIndex],
          destinations[currentIndex],
          caseSensitive
        )
      ) {
        throw new Error(
          `Managed shard outputs overlap within one operation: "${destinations[previousIndex]}" and ` +
            `"${destinations[currentIndex]}".`
        );
      }
    }
  }
  const gatePath: string = path.join(lockFolder, 'acquire.lock');
  await validateShardPathAsync(realBuild, gatePath);
  const attemptId: string = randomUUID();
  const makeClaim = (destination: string, kind: IOutputClaim['kind']): IOutputClaim => ({
    ...owner,
    version: 2,
    kind,
    destination,
    attemptId,
    host: hostname(),
    pid: process.pid,
    processStartedAt: PROCESS_STARTED_AT,
    acquiredAt: new Date().toISOString()
  });
  let gate: IShardOutputLock | undefined;
  const gateDeadline: number = Date.now() + 2000;
  let retryCount: number = 0;
  while (!gate) {
    try {
      gate = acquireOutputLock(gatePath, makeClaim(destinations.join(', '), 'registration'), false);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (Date.now() >= gateDeadline) throw gateContentionError(gatePath, retryCount, gateDeadline);
      retryCount++;
      await sleepAsync(5 + Math.floor(Math.random() * 16));
    }
  }
  const locks: IShardOutputLock[] = [];
  let acquisitionError: unknown;
  try {
    for (const entry of fsSync.readdirSync(lockFolder, { withFileTypes: true })) {
      if (entry.name === 'acquire.lock' || !entry.name.endsWith('.lock')) continue;
      const filename: string = path.join(lockFolder, entry.name);
      let claim: IOutputClaim;
      try {
        const stats: BigIntStats = fsSync.lstatSync(filename, { bigint: true });
        if (!stats.isFile() || stats.nlink !== 1n) throw ownershipError(filename);
        const value: unknown = JSON.parse(fsSync.readFileSync(filename, 'utf8'));
        if (
          !isOutputClaim(value) ||
          value.kind !== 'output' ||
          getShardOutputIdentity(realBuild, path.resolve(realBuild, value.destination)) !==
            value.destination ||
          `${createHash('sha256').update(value.destination).digest('hex')}.lock` !== entry.name
        ) {
          throw ownershipError(filename);
        }
        claim = value;
      } catch (error) {
        // A normal release can race directory enumeration, but a malformed/legacy claim is not reclaimable.
        if (FileSystem.isNotExistError(error as Error)) continue;
        throw ownershipError(filename);
      }
      for (const destination of destinations) {
        if (
          await doShardOutputIdentitiesOverlapAsync(lockFolder, destination, claim.destination, caseSensitive)
        ) {
          throw ownershipError(filename);
        }
      }
    }
    for (const destination of destinations) {
      const filename: string = path.join(
        lockFolder,
        `${createHash('sha256').update(destination).digest('hex')}.lock`
      );
      const lock: IShardOutputLock = acquireOutputLock(
        filename,
        makeClaim(destination, 'output'),
        true,
        abortSignal
      );
      locks.push(lock);
    }
  } catch (error) {
    acquisitionError = error;
  }
  if (acquisitionError !== undefined) {
    const errors: unknown[] = [acquisitionError];
    try {
      releaseShardOutputLocks(locks);
    } catch (error) {
      errors.push(error);
    }
    try {
      gate.release();
    } catch (error) {
      errors.push(error);
    }
    if (errors.length === 1) throw acquisitionError;
    throw new AggregateError(errors, 'Failed to register and clean up managed shard output ownership.');
  }
  try {
    gate.release();
  } catch (error) {
    const errors: unknown[] = [error];
    try {
      releaseShardOutputLocks(locks);
    } catch (releaseError) {
      errors.push(releaseError);
    }
    throw new AggregateError(errors, 'Failed to finalize managed shard output ownership registration.');
  }
  return locks;
}
