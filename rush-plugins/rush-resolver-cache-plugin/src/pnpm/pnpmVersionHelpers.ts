// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IResolverContext } from '../types';

/**
 * The major version of pnpm being used. Each version uses a different lockfile format
 * and store layout:
 * - pnpm 8: lockfile v6, store v3, MD5 base32 hash for dep paths
 * - pnpm 9: lockfile v9, store v3, MD5 base32 hash for dep paths
 * - pnpm 10: lockfile v9, store v10, SHA-256 hex hash for dep paths
 */
export type PnpmMajorVersion = 8 | 9 | 10;

/**
 * Version-specific helpers for resolving pnpm dependency paths, lockfile keys,
 * and store index paths. Each pnpm major version has its own implementation.
 */
export interface IPnpmVersionHelpers {
  /**
   * Converts a pnpm dependency path to its on-disk folder name.
   * Uses MD5 base32 hashing for pnpm 8/9 and SHA-256 hex hashing for pnpm 10.
   */
  depPathToFilename(depPath: string): string;

  /**
   * Constructs the full lockfile package key from a package name and version specifier.
   * pnpm 8 uses `/{name}\@{specifier}` (v6 key format); pnpm 9/10 use `{name}\@{specifier}` (v9 key format).
   */
  buildDependencyKey(name: string, specifier: string): string;

  /**
   * Computes the pnpm store index file path for a given package integrity hash.
   * @param pnpmStorePath - The root pnpm store path (e.g. `~/.local/share/pnpm/store`)
   * @param context - The resolver context for the package (provides name/version for v10 paths)
   * @param hash - The hex-encoded integrity hash
   */
  getStoreIndexPath(pnpmStorePath: string, context: IResolverContext, hash: string): string;
}

/**
 * Loads the version-specific pnpm helpers for the given major version.
 * Uses async imports so that only the needed version's code is loaded.
 */
export async function getPnpmVersionHelpersAsync(version: PnpmMajorVersion): Promise<IPnpmVersionHelpers> {
  switch (version) {
    case 8:
      return (await import('./v8')).helpers;
    case 9:
      return (await import('./v9')).helpers;
    case 10:
      return (await import('./v10')).helpers;
    default:
      throw new Error(`Unsupported pnpm major version: ${version}`);
  }
}
