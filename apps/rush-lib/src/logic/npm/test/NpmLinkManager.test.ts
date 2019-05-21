// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { InstallManager, IInstallManagerOptions } from '../../InstallManager';
import { PurgeManager } from '../../PurgeManager';
import { RushConfiguration } from '../../../api/RushConfiguration';
import { RushGlobalFolder } from '../../../api/RushGlobalFolder';

describe('_linkProjects', () => {
  const rushFilename: string = path.resolve(__dirname, 'repo', 'rush.json');
  const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
    rushFilename
  );

  const rushGlobalFolder: RushGlobalFolder = new RushGlobalFolder();

  const purgeManager: PurgeManager = new PurgeManager(
    rushConfiguration,
    rushGlobalFolder
  );

  const installManagerOptions: IInstallManagerOptions = {
    debug: true,
    allowShrinkwrapUpdates: true,
    bypassPolicy: false,
    noLink: false,
    fullUpgrade: false,
    recheckShrinkwrap: false,
    networkConcurrency: undefined,
    collectLogFile: false
  };

  const testInstallManager: InstallManager = new InstallManager(
    rushConfiguration,
    rushGlobalFolder,
    purgeManager,
    installManagerOptions
  );

  it('links projects', () => {
    return testInstallManager.doInstall().then(() => {
      // HALP: Not sure how to get this into an error state first to test the new logic
      console.log('Installation done?');
    });
  }, 60000);
});
