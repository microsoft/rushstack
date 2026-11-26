// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';

import { validateShardRelativePath } from './ShardFileSystem';

/**
 * Project-relative shard slots supplied by the orchestrator.
 * @public
 */
export interface IShardFolderConfiguration {
  readonly shardParentFolder: string;
  readonly shardFolderNameTemplate: string;
}

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
  parseShardPair(`${identity.shardIndex}/${identity.shardCount}`);
  return `${identity.shardIndex}/${identity.shardCount}`;
}

/**
 * Formats one slot using the orchestrator's naming convention, numeric by default as in Rush.
 * @public
 */
export function getShardFolderName(
  shardIndex: number,
  shardFolderNameTemplate: string = '{shardIndex}'
): string {
  if (!Number.isSafeInteger(shardIndex) || shardIndex < 1) {
    throw new Error('The shard index must be a positive safe integer.');
  }
  const parts: string[] = shardFolderNameTemplate.split('{shardIndex}');
  if (parts.length !== 2 || /[{}]/.test(parts.join(''))) {
    throw new Error('The shard folder name template must contain exactly one "{shardIndex}" token.');
  }
  const name: string = `${parts[0]}${shardIndex}${parts[1]}`;
  validateFolderName(name);
  return name;
}

/**
 * Validates relative configuration without resolving it or inspecting the filesystem.
 * @public
 */
export function getShardFolderConfiguration(
  shardParentFolder: string,
  shardFolderNameTemplate: string
): IShardFolderConfiguration {
  validateShardRelativePath(shardParentFolder);
  getShardFolderName(1, shardFolderNameTemplate);
  return { shardParentFolder, shardFolderNameTemplate };
}

/**
 * Adapts Rush's legacy prefix argument, which may include a literal basename prefix.
 * For example, "temp/shards/part-" means parent "temp/shards", template "part-{shardIndex}".
 * @public
 */
export function getShardFolderConfigurationFromPrefix(prefix: string): IShardFolderConfiguration {
  const separatorIndex: number = Math.max(prefix.lastIndexOf('/'), prefix.lastIndexOf('\\'));
  if (separatorIndex < 1) {
    throw new Error('The shard prefix must name a folder below the project root.');
  }
  return getShardFolderConfiguration(
    prefix.slice(0, separatorIndex),
    `${prefix.slice(separatorIndex + 1)}{shardIndex}`
  );
}

/**
 * Adapts Rush's legacy exact output directory, whose final template token is the shard index.
 * @public
 */
export function getShardFolderConfigurationFromOutputDirectory(
  outputDirectory: string,
  identity: IShardIdentity
): IShardFolderConfiguration {
  formatShardPair(identity);
  validateShardRelativePath(outputDirectory);
  const suffix: string = String(identity.shardIndex);
  if (!outputDirectory.endsWith(suffix)) {
    throw new Error(`The shard output directory must end with its shard index "${suffix}".`);
  }
  return getShardFolderConfigurationFromPrefix(outputDirectory.slice(0, -suffix.length));
}

/**
 * Returns a project-relative slot path; configuration remains independent of a checkout's absolute path.
 * @public
 */
export function getShardFolderPath(configuration: IShardFolderConfiguration, shardIndex: number): string {
  validateShardRelativePath(configuration.shardParentFolder);
  return path.join(
    configuration.shardParentFolder.replace(/\\/g, '/'),
    getShardFolderName(shardIndex, configuration.shardFolderNameTemplate)
  );
}

/**
 * Uses Heft's existing phase/task temp layout to isolate each producer's result within a slot.
 * @public
 */
export function getShardTaskFolderPath(shardFolderPath: string, phaseName: string, taskName: string): string {
  validateFolderName(phaseName);
  validateFolderName(taskName);
  return path.join(shardFolderPath, phaseName, taskName);
}

function validateFolderName(name: string): void {
  if (!name || name === '.' || name === '..' || /[/\\]/.test(name)) {
    throw new Error(`Expected a single folder name, received ${JSON.stringify(name)}.`);
  }
  validateShardRelativePath(name);
}
