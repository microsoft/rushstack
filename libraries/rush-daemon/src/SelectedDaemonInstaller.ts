// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { _FlagFile } from '@microsoft/rush-lib';
import { Utilities } from '@microsoft/rush-lib/lib/utilities/Utilities';
import { LockFile } from '@rushstack/node-core-library';

import { assertExactDaemonVersion } from './VersionSelectedDaemonLauncher';

async function mainAsync(): Promise<void> {
  const [cacheFolder, daemonVersion, repoRoot] = process.argv.slice(2);
  if (!cacheFolder || !path.isAbsolute(cacheFolder) || !repoRoot || !path.isAbsolute(repoRoot)) {
    throw new Error('Daemon installation requires absolute cache and repository folders.');
  }
  assertExactDaemonVersion(daemonVersion);
  const folder: string = path.join(cacheFolder, `daemon-${daemonVersion}`);
  // The native installer empties its installation directory; its mutex must live outside that directory.
  const lock: LockFile = await LockFile.acquireAsync(cacheFolder, 'rush-daemon-install', 120000);
  try {
    const marker: _FlagFile = new _FlagFile(folder, 'last-install', {
      node: process.versions.node,
      daemonVersion
    });
    if (await marker.isValidAsync()) return;
    await Utilities.installPackageInDirectoryAsync({
      directory: folder,
      packageName: '@rushstack/rush-daemon',
      version: daemonVersion,
      tempPackageTitle: 'rush-daemon-local-install',
      maxInstallAttempts: 3,
      commonRushConfigFolder: path.join(repoRoot, 'common', 'config', 'rush'),
      suppressOutput: true,
      filterNpmIncompatibleProperties: true
    });
    await marker.createAsync();
  } finally {
    lock.release();
  }
}

if (require.main === module) {
  mainAsync().catch((error: Error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
