// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { SnapshotResolver } from 'jest-snapshot';

const LIB_PREFIX: string = `lib${path.sep}`;
const SRC_PREFIX: string = `src${path.sep}`;
const SNAPSHOTS_FOLDER_NAME: string = '__snapshots__';

const ROOT_PATH_ENV_VAR_NAME: string = 'HEFTSNAPSHOTRESOLVER_ROOT_PATH';

export class HeftSnapshotResolver implements SnapshotResolver {
  /**
   * Example test path, used for preflight consistency check of the implementation above
   */
  public testPathForConsistencyCheck: string = path.join(
    HeftSnapshotResolver.buildRoot!,
    'lib',
    'subfolder',
    'test',
    'example.test.js'
  );

  public static get buildRoot(): string {
    return process.env[ROOT_PATH_ENV_VAR_NAME]!;
  }

  public static set buildRoot(buildRoot: string) {
    process.env[ROOT_PATH_ENV_VAR_NAME] = buildRoot;
  }

  /**
   * resolves from test to snapshot path
   */
  public resolveSnapshotPath: (testFilePath: string, snapshotExtension?: string) => string = (
    testFilePath: string,
    snapshotExtension?: string
  ) => {
    let snapshotFolderPath: string = path.relative(HeftSnapshotResolver.buildRoot, testFilePath);
    const snapshotFilename: string = path.basename(snapshotFolderPath) + (snapshotExtension || '');
    snapshotFolderPath = path.dirname(snapshotFolderPath);

    if (snapshotFolderPath.startsWith(LIB_PREFIX)) {
      // We need to map the snapshot back to the src folder
      snapshotFolderPath = SRC_PREFIX + snapshotFolderPath.substr(LIB_PREFIX.length);
    }

    return path.join(
      HeftSnapshotResolver.buildRoot,
      snapshotFolderPath,
      SNAPSHOTS_FOLDER_NAME,
      snapshotFilename
    );
  };

  /**
   * resolves from snapshot to test path
   */
  public resolveTestPath: (snapshotFilePath: string, snapshotExtension?: string) => string = (
    snapshotFilePath: string,
    snapshotExtension?: string
  ) => {
    let testFolderPath: string = path.relative(HeftSnapshotResolver.buildRoot, snapshotFilePath);
    let testFilename: string = path.basename(testFolderPath);
    testFolderPath = path.dirname(testFolderPath);

    // Drop the extension if it exists
    if (snapshotExtension && testFilename.endsWith(snapshotExtension)) {
      testFilename = testFilename.substr(0, testFilename.length - snapshotExtension.length);
    }

    if (testFolderPath.startsWith(SRC_PREFIX)) {
      // We need to map the snapshot back to the src folder
      testFolderPath = LIB_PREFIX + testFolderPath.substr(SRC_PREFIX.length);
    }

    if (testFolderPath.endsWith(SNAPSHOTS_FOLDER_NAME)) {
      testFolderPath = path.dirname(testFolderPath);
    }

    return path.join(HeftSnapshotResolver.buildRoot, testFolderPath, testFilename);
  };
}
