// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';

/**
 * Which shard of a sharded run the current process is.
 *
 * @public
 */
export interface IShardIdentity {
  /**
   * The 1-based index of this shard.
   *
   * @remarks
   * Rush's shard loop is 1-based, and every mainstream test runner's `--shard` syntax is
   * 1-based as well, so no conversion is performed anywhere in this package.
   */
  shardIndex: number;

  /**
   * The total number of shards in this run.
   */
  shardCount: number;
}

/**
 * The `k/n` syntax shared by Rush's default `shardArgumentFormat` and every mainstream
 * test runner's `--shard` parameter.
 *
 * @remarks
 * The pattern deliberately anchors both ends and allows no whitespace, sign, or separator
 * beyond a single `/`. Jest's own parser splits on `/` and then *filters out* the
 * non-numeric segments before checking that two remain, which means it silently accepts
 * inputs such as `"x/1/2"` as shard 1 of 2. Reproducing that behavior would turn a typo
 * into a run that quietly tests a fraction of the suite, so this parser rejects it.
 */
const SHARD_PAIR_REGEXP: RegExp = /^(\d+)\/(\d+)$/;

/**
 * Parses the `k/n` value of a `--shard` parameter.
 *
 * @remarks
 * The returned value is validated to the same rules the underlying runners enforce, but it
 * is validated *here* so that the failure is reported against the Heft parameter the user
 * actually typed, before any workload starts.
 *
 * @param value - the raw parameter value, for example `"2/4"`
 * @returns the parsed shard identity
 *
 * @public
 */
export function parseShardPair(value: string): IShardIdentity {
  const match: RegExpExecArray | null = SHARD_PAIR_REGEXP.exec(value);
  if (!match || match[0] !== value) {
    throw new Error(
      `Invalid "--shard" value ${JSON.stringify(value)}: expected the format "<index>/<count>",` +
        ` for example "2/4".`
    );
  }

  const shardIndex: number = Number.parseInt(match[1], 10);
  const shardCount: number = Number.parseInt(match[2], 10);

  if (!Number.isSafeInteger(shardIndex) || !Number.isSafeInteger(shardCount)) {
    throw new Error(
      `Invalid "--shard" value ${JSON.stringify(value)}: index and count must be safe integers.`
    );
  }

  if (shardIndex < 1 || shardCount < 1) {
    throw new Error(
      `Invalid "--shard" value ${JSON.stringify(value)}: the index and count are 1-based, so neither` +
        ` may be zero.`
    );
  }

  if (shardIndex > shardCount) {
    throw new Error(
      `Invalid "--shard" value ${JSON.stringify(value)}: the index ${shardIndex} is greater than the` +
        ` count ${shardCount}.`
    );
  }

  return { shardIndex, shardCount };
}

/**
 * Formats a shard identity back into the `k/n` syntax.
 *
 * @public
 */
export function formatShardPair(identity: IShardIdentity): string {
  return `${identity.shardIndex}/${identity.shardCount}`;
}

/**
 * Returns the name of the shard-scoped subfolder for the given shard.
 *
 * @remarks
 * Concurrent shards of the same operation run in the same project folder, so any state a
 * workload keeps under its temp folder — a Jest haste map, a cache, a lockfile — is shared
 * by default. Every shard-scoped path in this package is derived from this one function so
 * that the isolation cannot be applied inconsistently.
 *
 * @public
 */
export function getShardFolderName(shardIndex: number): string {
  return `shard-${shardIndex}`;
}

/**
 * Returns an isolated cache folder, including the partition count to avoid reusing a different partition.
 * @public
 */
export function getShardTempFolderPath(tempFolderPath: string, identity: IShardIdentity): string {
  return path.join(tempFolderPath, `${getShardFolderName(identity.shardIndex)}-of-${identity.shardCount}`);
}
