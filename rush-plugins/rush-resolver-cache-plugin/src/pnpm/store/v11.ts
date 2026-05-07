// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// NOTE: pnpm 11 does NOT use per-package JSON index files.  Instead the entire store index
// is stored in a single SQLite database at `{storeDir}/v11/index.db`, encoded with msgpackr.
// The `getStoreIndexPath` function below exists only to satisfy the `IPnpmVersionHelpers`
// interface; at runtime, `afterInstallAsync.ts` detects pnpm 11 and queries the SQLite
// database directly instead of reading the path returned here.
//
// Historical store v11 path format (never actually used by pnpm 11):
// {storeDir}/v11/index/{hash[0:2]}/{hash[2:64]}-{name}@{version}.json

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
