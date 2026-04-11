// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Store v10 index path format (used by pnpm 10):
// {storeDir}/v10/index/{hash[0:2]}/{hash[2:64]}-{name}@{version}.json
// Falls back to directory scan when the primary path doesn't exist.

import { existsSync, readdirSync } from 'node:fs';

import type { IResolverContext } from '../../types';

export function getStoreIndexPath(pnpmStorePath: string, context: IResolverContext, hash: string): string {
  // pnpm 10 truncates integrity hashes to 32 bytes (64 hex chars) for index paths.
  const truncHash: string = hash.length > 64 ? hash.slice(0, 64) : hash;
  const hashDir: string = truncHash.slice(0, 2);
  const hashRest: string = truncHash.slice(2);
  // pnpm 10 index path format: <hash (0-2)>/<hash (2-64)>-<name>@<version>.json
  const pkgName: string = (context.name || '').replace(/\//g, '+');
  const nameVer: string = context.version ? `${pkgName}@${context.version}` : pkgName;
  let indexPath: string = `${pnpmStorePath}/v10/index/${hashDir}/${hashRest}-${nameVer}.json`;
  // For truncated/hashed folder names, nameVer from the key may be wrong.
  // Fallback: scan the directory for a file matching the hash prefix.
  if (!existsSync(indexPath)) {
    const dir: string = `${pnpmStorePath}/v10/index/${hashDir}/`;
    const filePrefix: string = `${hashRest}-`;
    try {
      const entries: import('node:fs').Dirent[] = readdirSync(dir, { withFileTypes: true });
      const match: import('node:fs').Dirent | undefined = entries.find(
        (e) => e.isFile() && e.name.startsWith(filePrefix)
      );
      if (match) {
        indexPath = dir + match.name;
      }
    } catch {
      // ignore
    }
  }
  return indexPath;
}
