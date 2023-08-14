// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushConfiguration } from '../../api/RushConfiguration';
import type { RushGlobalFolder } from '../../api/RushGlobalFolder';
import type { BaseInstallManager } from '../base/BaseInstallManager';
import { InstallManagerFactory } from '../InstallManagerFactory';
import { SetupChecks } from '../SetupChecks';
import { PurgeManager } from '../PurgeManager';
import { VersionMismatchFinder } from '../versionMismatch/VersionMismatchFinder';
import { ITerminal } from '@rushstack/node-core-library';

export interface IRunInstallOptions {
  rushConfiguration: RushConfiguration;
  rushGlobalFolder: RushGlobalFolder;
  isDebug: boolean;
  terminal: ITerminal;
}

export async function doBasicInstallAsync(options: IRunInstallOptions): Promise<void> {
  const { rushConfiguration, rushGlobalFolder, isDebug } = options;

  VersionMismatchFinder.ensureConsistentVersions(rushConfiguration, options.terminal);
  SetupChecks.validate(rushConfiguration);

  const purgeManager: typeof PurgeManager.prototype = new PurgeManager(rushConfiguration, rushGlobalFolder);

  const installManager: BaseInstallManager = await InstallManagerFactory.getInstallManagerAsync(
    rushConfiguration,
    rushGlobalFolder,
    purgeManager,
    {
      debug: isDebug,
      allowShrinkwrapUpdates: false,
      checkOnly: false,
      bypassPolicy: false,
      noLink: false,
      fullUpgrade: false,
      recheckShrinkwrap: false,
      collectLogFile: false,
      pnpmFilterArguments: [],
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
