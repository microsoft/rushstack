// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Store v11 index path format (used by pnpm 11):
// {storeDir}/v11/index/{hash[0:2]}/{hash[2:64]}-{name}@{version}.json
// Falls back to directory scan when the primary path doesn't exist.
// Same structure as store v10 but under the v11 subdirectory.

import { type Dirent, existsSync, readdirSync } from 'node:fs';

import type { IResolverContext } from '../../types';

const SCOPE_SEPARATOR_REGEX: RegExp = /\//g;

export function getStoreIndexPath(pnpmStorePath: string, context: IResolverContext, hash: string): string {
  // pnpm 11 truncates integrity hashes to 32 bytes (64 hex chars) for index paths.
  const truncHash: string = hash.length > 64 ? hash.slice(0, 64) : hash;
  const hashDir: string = truncHash.slice(0, 2);
  const hashRest: string = truncHash.slice(2);
  // pnpm 11 index path format: <hash (0-2)>/<hash (2-64)>-<name>@<version>.json
  const pkgName: string = (context.name || '').replace(SCOPE_SEPARATOR_REGEX, '+');
  const nameVer: string = context.version ? `${pkgName}@${context.version}` : pkgName;
  let indexPath: string = `${pnpmStorePath}/v11/index/${hashDir}/${hashRest}-${nameVer}.json`;
  // For truncated/hashed folder names, nameVer from the key may be wrong.
  // Fallback: scan the directory for a file matching the hash prefix.
  if (!existsSync(indexPath)) {
    const dir: string = `${pnpmStorePath}/v11/index/${hashDir}/`;
    const filePrefix: string = `${hashRest}-`;
    try {
      const entries: Dirent[] = readdirSync(dir, { withFileTypes: true });
      const match: Dirent | undefined = entries.find((e) => e.isFile() && e.name.startsWith(filePrefix));
      if (match) {
        indexPath = dir + match.name;
      }
    } catch {
      // ignore
    }
  }
  return indexPath;
}
