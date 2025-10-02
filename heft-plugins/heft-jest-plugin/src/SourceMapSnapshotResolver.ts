// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

function findSourcePath(testPath: string, snapshotExtension: string): string {
  const sourceMapFilePath: string = `${testPath}.map`;
  let sourceFilePath: string = testPath;
  try {
    const sourceMapContent: string = fs.readFileSync(sourceMapFilePath, 'utf-8');
    const {
      sources: [sourcePath]
    } = JSON.parse(sourceMapContent);
    sourceFilePath = path.resolve(path.dirname(testPath), sourcePath);
  } catch (err) {
    if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
      throw err;
    }
  }

  const { dir, base } = path.parse(sourceFilePath);
  return path.resolve(dir, '__snapshots__', base + snapshotExtension);
}

const testToSnapshotCache: Map<string, string> = new Map();
const snapshotToTestCache: Map<string, string> = new Map();

interface IJestSnapshotResolver {
  resolveSnapshotPath(testPath: string, snapshotExtension: string): string;
  resolveTestPath(snapshotFilePath: string, snapshotExtension: string): string;

  testPathForConsistencyCheck: string;
}

const testPathForConsistencyCheck: string = path.normalize('/home/rushstack/heft/lib/jest/test.js');

const snapshotResolver: IJestSnapshotResolver = {
  resolveSnapshotPath(testPath: string, snapshotExtension: string): string {
    testPath = path.normalize(testPath);
    let cachedPath: string | undefined = testToSnapshotCache.get(testPath);
    if (!cachedPath) {
      cachedPath = findSourcePath(testPath, snapshotExtension);
      testToSnapshotCache.set(testPath, cachedPath);
      snapshotToTestCache.set(cachedPath, testPath);
    }
    return cachedPath;
  },

  resolveTestPath(snapshotFilePath: string, snapshotExtension: string): string {
    snapshotFilePath = path.normalize(snapshotFilePath);
    const fromCache: string | undefined = snapshotToTestCache.get(snapshotFilePath);
    if (!fromCache) {
      throw new Error(`Expected snapshot lookup to happen first for ${snapshotFilePath}`);
    }
    return fromCache;
  },

  testPathForConsistencyCheck
};

export default snapshotResolver;
