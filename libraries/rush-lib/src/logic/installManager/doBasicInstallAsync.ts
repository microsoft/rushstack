// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminal } from '@rushstack/terminal';

import type { RushConfiguration } from '../../api/RushConfiguration';
import type { RushGlobalFolder } from '../../api/RushGlobalFolder';
import type { BaseInstallManager } from '../base/BaseInstallManager';
import type { IInstallManagerOptions } from '../base/BaseInstallManagerTypes';
import { InstallManagerFactory } from '../InstallManagerFactory';
import { SetupChecks } from '../SetupChecks';
import { PurgeManager } from '../PurgeManager';
import { VersionMismatchFinder } from '../versionMismatch/VersionMismatchFinder';
import type { Subspace } from '../../api/Subspace';

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
