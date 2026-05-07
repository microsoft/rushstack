// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Scans a raw msgpack-encoded buffer (as written by pnpm 11 into index.db) for file paths
 * that indicate a nested package inside a `node_modules/` subfolder of the package.
 *
 * pnpm 11 stores the package file index in a SQLite database (`index.db`) using msgpackr
 * encoding. Rather than fully decoding the msgpack, we scan the binary blob for any
 * occurrence of `/package.json` preceded by a valid path prefix. Entries beginning with
 * `node_modules/` are the bundled-dependency subdirectory paths the resolver cache needs.
 *
 * @param blob - Raw msgpack data blob from the `package_index` SQLite table
 * @returns Array of `node_modules/…` directory paths (without trailing `/package.json`),
 *          or `true` when no bundled-dependency nested packages are found.
 */
export function findNestedPackageJsonDirsInMsgpackBlob(blob: Uint8Array): string[] | true {
  const buf: Buffer = Buffer.from(blob);
  // We look for occurrences of `/package.json` inside the binary blob.
  // Each such occurrence indicates a nested package.json file; the bytes immediately
  // before form the directory path within the package (e.g. `node_modules/react`).
  const nestedMarker: Buffer = Buffer.from('/package.json');
  const dirs: string[] = [];
  let pos: number = 0;

  while (true) {
    const idx: number = buf.indexOf(nestedMarker, pos);
    if (idx < 0) break;

    // Scan backward from the marker to find the start of the path string.
    // Valid path characters: alphanumeric, /, ., @, -, _, +
    let start: number = idx;
    while (start > 0) {
      const c: number = buf[start - 1];
      if (
        (c >= 0x30 && c <= 0x39) || // 0-9
        (c >= 0x41 && c <= 0x5a) || // A-Z
        (c >= 0x61 && c <= 0x7a) || // a-z
        c === 0x2f || // /
        c === 0x2e || // .
        c === 0x40 || // @
        c === 0x2d || // -
        c === 0x5f || // _
        c === 0x2b // +
      ) {
        start--;
      } else {
        break;
      }
    }

    const dir: string = buf.slice(start, idx).toString('utf8');
    // Only bundled-dependency paths (under node_modules/) are relevant here.
    // Root-level package.json entries (dir === '') are skipped.
    if (dir.startsWith('node_modules/')) {
      dirs.push(dir);
    }
    pos = idx + nestedMarker.length;
  }

  return dirs.length > 0 ? dirs : true;
}

/**
 * Queries the pnpm 11 SQLite store index database for the given package and returns
 * the list of `node_modules/…` subdirectory paths that contain nested `package.json` files.
 *
 * pnpm 11 stores per-package file metadata in `{storeDir}/v11/index.db` (SQLite) using
 * msgpackr encoding, replacing the per-file JSON index used by pnpm ≤10.
 *
 * @param db - Open SQLite database instance (from `node:sqlite` DatabaseSync)
 * @param descriptionFileHash - Raw integrity string from the lockfile (e.g. `sha512-…==`)
 * @param name - Package name (e.g. `react`)
 * @param version - Package version string, or `undefined` for unversioned entries
 * @returns Array of nested directory paths, `true` when the package has no bundled deps,
 *          or `false` if the package was not found in the store (missing optional dep).
 */
export function findNestedPackageJsonDirsFromSqlite(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  descriptionFileHash: string,
  name: string,
  version: string | undefined
): string[] | boolean {
  // pnpm 11 SQLite key format: "{integrity}\t{name}@{version}"
  const nameVer: string = version ? `${name}@${version}` : name;
  const exactKey: string = `${descriptionFileHash}\t${nameVer}`;

  // Try an exact key lookup first (fast path).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let row: any = db.prepare('SELECT data FROM package_index WHERE key = ?').get(exactKey);

  if (!row) {
    // Fallback: search by integrity hash alone in case the stored name/version differs
    // (e.g. aliased packages).  The integrity hash uniquely identifies the content.
    row = db
      .prepare("SELECT data FROM package_index WHERE key LIKE ? || '\t%'")
      .get(descriptionFileHash);
  }

  if (!row) {
    // Package not found in store – it was likely not installed (missing optional dep).
    return false;
  }

  return findNestedPackageJsonDirsInMsgpackBlob(row.data as Uint8Array);
}
