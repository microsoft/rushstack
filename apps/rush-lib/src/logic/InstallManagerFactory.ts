// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

console.log('InstallManagerFactory.ts  : 1: ' + (new Date().getTime() % 20000) / 1000.0);
import * as colors from 'colors';
console.log('InstallManagerFactory.ts  : 2: ' + (new Date().getTime() % 20000) / 1000.0);
import * as semver from 'semver';
console.log('InstallManagerFactory.ts  : 3: ' + (new Date().getTime() % 20000) / 1000.0);

import { BaseInstallManager, IInstallManagerOptions } from './base/BaseInstallManager';
console.log('InstallManagerFactory.ts  : 4: ' + (new Date().getTime() % 20000) / 1000.0);
import { RushInstallManager } from './installManager/RushInstallManager';
console.log('InstallManagerFactory.ts  : 5: ' + (new Date().getTime() % 20000) / 1000.0);
import { WorkspaceInstallManager } from './installManager/WorkspaceInstallManager';
console.log('InstallManagerFactory.ts  : 6: ' + (new Date().getTime() % 20000) / 1000.0);
import { AlreadyReportedError } from '../utilities/AlreadyReportedError';
console.log('InstallManagerFactory.ts  : 7: ' + (new Date().getTime() % 20000) / 1000.0);
import { PurgeManager } from './PurgeManager';
console.log('InstallManagerFactory.ts  : 8: ' + (new Date().getTime() % 20000) / 1000.0);
import { RushConfiguration } from '../api/RushConfiguration';
console.log('InstallManagerFactory.ts  : 9: ' + (new Date().getTime() % 20000) / 1000.0);
import { RushGlobalFolder } from '../api/RushGlobalFolder';
console.log('InstallManagerFactory.ts  : 10: ' + (new Date().getTime() % 20000) / 1000.0);

export class InstallManagerFactory {
  public static getInstallManager(
    rushConfiguration: RushConfiguration,
    rushGlobalFolder: RushGlobalFolder,
    purgeManager: PurgeManager,
    options: IInstallManagerOptions
  ): BaseInstallManager {
    if (
      rushConfiguration.packageManager === 'pnpm' &&
      rushConfiguration.pnpmOptions &&
      rushConfiguration.pnpmOptions.useWorkspaces
    ) {
      if (!semver.satisfies(rushConfiguration.packageManagerToolVersion, '>=4.14.3')) {
        console.log();
        console.log(
          colors.red(
            'Workspaces are only supported in Rush for PNPM >=4.14.3. Upgrade PNPM to use the workspaces feature.'
          )
        );
        throw new AlreadyReportedError();
      }

      return new WorkspaceInstallManager(rushConfiguration, rushGlobalFolder, purgeManager, options);
    }

    return new RushInstallManager(rushConfiguration, rushGlobalFolder, purgeManager, options);
  }
}
