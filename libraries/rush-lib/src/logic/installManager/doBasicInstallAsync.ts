// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminal } from '@rushstack/terminal';

import type { RushConfiguration } from '../../api/RushConfiguration.ts';
import type { RushGlobalFolder } from '../../api/RushGlobalFolder.ts';
import type { BaseInstallManager } from '../base/BaseInstallManager.ts';
import type { IInstallManagerOptions } from '../base/BaseInstallManagerTypes.ts';
import { InstallManagerFactory } from '../InstallManagerFactory.ts';
import { SetupChecks } from '../SetupChecks.ts';
import { PurgeManager } from '../PurgeManager.ts';
import { VersionMismatchFinder } from '../versionMismatch/VersionMismatchFinder.ts';
import type { Subspace } from '../../api/Subspace.ts';

export interface IRunInstallOptions {
  afterInstallAsync?: IInstallManagerOptions['afterInstallAsync'];
  beforeInstallAsync?: IInstallManagerOptions['beforeInstallAsync'];
  rushConfiguration: RushConfiguration;
  rushGlobalFolder: RushGlobalFolder;
  isDebug: boolean;
  terminal: ITerminal;
  variant: string | undefined;
  subspace: Subspace;
}

export async function doBasicInstallAsync(options: IRunInstallOptions): Promise<void> {
  const {
    rushConfiguration,
    rushGlobalFolder,
    isDebug,
    variant,
    terminal,
    beforeInstallAsync,
    afterInstallAsync,
    subspace
  } = options;

  VersionMismatchFinder.ensureConsistentVersions(rushConfiguration, terminal, {
    variant,
    subspace
  });
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
      offline: false,
      collectLogFile: false,
      pnpmFilterArgumentValues: [],
      selectedProjects: new Set(rushConfiguration.projects),
      maxInstallAttempts: 1,
      networkConcurrency: undefined,
      subspace,
      terminal,
      variant,
      afterInstallAsync,
      beforeInstallAsync
    }
  );

  try {
    await installManager.doInstallAsync();
  } finally {
    await purgeManager.startDeleteAllAsync();
  }
}
