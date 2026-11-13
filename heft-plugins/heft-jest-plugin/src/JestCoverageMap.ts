// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type { CoverageMap, FileCoverageData } from 'istanbul-lib-coverage';

export interface IJestFileCoverageData extends FileCoverageData {
  /** Istanbul discards this untested-file baseline when real coverage exists. */
  all?: boolean;
  /** Truthy branch counts produced by Istanbul's reportLogic option. */
  bT?: Record<string, number[]>;
}

export interface ICoverageSource {
  hash: string;
  text: string;
}

export function validateCoverageIdentity(identity: string): void {
  if (
    !identity ||
    path.posix.isAbsolute(identity) ||
    path.win32.isAbsolute(identity) ||
    identity.includes('\\') ||
    identity.includes(':') ||
    identity.includes('\0') ||
    identity.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error(`Invalid build-root-relative coverage identity: "${identity}".`);
  }
}

/** Convert a native absolute filename inside the build root to a portable identity. */
export function coverageIdentity(buildFolderPath: string, filename: string): string {
  if (!path.isAbsolute(buildFolderPath) || !path.isAbsolute(filename)) {
    throw new Error('Coverage paths must be absolute.');
  }
  const identity: string = path.relative(buildFolderPath, filename).split(path.sep).join('/');
  validateCoverageIdentity(identity);
  return identity;
}

/**
 * Detach remapped Istanbul coverage from class instances and source-map caches for JSON serialization.
 * Sources are keyed by build-root-relative identity; their hashes are not read or verified here.
 */
export function portableCoverageMap(
  map: CoverageMap,
  buildFolderPath: string,
  sources: ReadonlyMap<string, ICoverageSource>
): Record<string, IJestFileCoverageData> {
  const portable: Record<string, IJestFileCoverageData> = Object.create(null);
  for (const filename of map.files().sort()) {
    const identity: string = coverageIdentity(buildFolderPath, filename);
    if (Object.hasOwn(portable, identity)) {
      throw new Error(`Duplicate coverage identity "${identity}".`);
    }
    const coverage: IJestFileCoverageData = map.fileCoverageFor(filename).data;
    if (coverage.path !== filename) {
      throw new Error(`Coverage path does not match map entry "${filename}".`);
    }
    const { statementMap, fnMap, branchMap, s, f, b, bT, all } = coverage;
    const data: IJestFileCoverageData = structuredClone({
      path: identity,
      statementMap,
      fnMap,
      branchMap,
      s,
      f,
      b,
      ...(bT === undefined ? {} : { bT }),
      ...(all === undefined ? {} : { all })
    });
    const source: ICoverageSource | undefined = sources.get(identity);
    if (!source) {
      throw new Error(`Missing original coverage source "${identity}".`);
    }
    const validateCount = (count: number): void => {
      if (!Number.isSafeInteger(count) || count < 0) {
        throw new Error(`Invalid coverage count for "${identity}".`);
      }
    };
    for (const counts of [data.s, data.f]) {
      for (const count of Object.values(counts)) {
        validateCount(count);
      }
    }
    for (const counts of [data.b, data.bT]) {
      if (counts) {
        for (const branchCounts of Object.values(counts)) {
          for (const count of branchCounts) {
            validateCount(count);
          }
        }
      }
    }
    const lines: string[] = source.text.split(/\r\n|\r|\n/);
    const normalizeEnd = (location: FileCoverageData['statementMap'][string]): void => {
      // Remapping uses Infinity for an end-of-line without an exact column mapping.
      // Only this sentinel may be replaced; JSON would silently turn other non-finite numbers into null.
      if (location.end.column === Number.POSITIVE_INFINITY) {
        const line: string | undefined = lines[location.end.line - 1];
        if (line === undefined) {
          throw new Error(`Invalid coverage source-map line for "${identity}".`);
        }
        location.end.column = line.length;
      }
    };
    for (const location of Object.values(data.statementMap)) {
      normalizeEnd(location);
    }
    for (const fn of Object.values(data.fnMap)) {
      normalizeEnd(fn.loc);
      normalizeEnd(fn.decl);
    }
    for (const branch of Object.values(data.branchMap)) {
      normalizeEnd(branch.loc);
      for (const location of branch.locations) {
        normalizeEnd(location);
      }
    }
    portable[identity] = data;
  }
  // Implicit else arms contain undefined positions, which must become empty JSON objects.
  return JSON.parse(
    JSON.stringify(portable, (key: string, value: unknown) => {
      if (typeof value === 'number' && !Number.isFinite(value)) {
        throw new Error(`Non-finite coverage value for "${key}".`);
      }
      return value;
    })
  );
}
