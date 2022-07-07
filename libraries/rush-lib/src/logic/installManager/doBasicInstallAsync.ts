// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushConfiguration } from '../../api/RushConfiguration';
import type { RushGlobalFolder } from '../../api/RushGlobalFolder';
import type { BaseInstallManager } from '../base/BaseInstallManager';
import { InstallManagerFactory } from '../InstallManagerFactory';
import { SetupChecks } from '../SetupChecks';
import { PurgeManager } from '../PurgeManager';
import { VersionMismatchFinder } from '../versionMismatch/VersionMismatchFinder';

export interface IRunInstallOptions {
  rushConfiguration: RushConfiguration;
  rushGlobalFolder: RushGlobalFolder;
  isDebug: boolean;
}

export async function doBasicInstallAsync(options: IRunInstallOptions): Promise<void> {
  const { rushConfiguration, rushGlobalFolder, isDebug } = options;

  VersionMismatchFinder.ensureConsistentVersions(rushConfiguration);
  SetupChecks.validate(rushConfiguration);

  const purgeManager: typeof PurgeManager.prototype = new PurgeManager(rushConfiguration, rushGlobalFolder);

  const installManager: BaseInstallManager = InstallManagerFactory.getInstallManager(
    rushConfiguration,
    rushGlobalFolder,
    purgeManager,
    {
      debug: isDebug,
      allowShrinkwrapUpdates: false,
      ignoreScripts: false,
      checkOnly: false,
      bypassPolicy: false,
      noLink: false,
      fullUpgrade: false,
      recheckShrinkwrap: false,
      includeSplitWorkspace: false,
      collectLogFile: false,
      pnpmFilterArguments: [],
      splitWorkspacePnpmFilterArguments: [],
      maxInstallAttempts: 1,
      networkConcurrency: undefined
    }
  );

  try {
    await installManager.doInstallAsync();
  } finally {
    purgeManager.deleteAll();
  }
}
