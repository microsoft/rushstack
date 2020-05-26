// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as semver from 'semver';

import { BaseInstallManager, IInstallManagerOptions } from './base/BaseInstallManager';
import { RushInstallManager } from './RushInstallManager';
import { WorkspaceInstallManager } from './WorkspaceInstallManager';
import { AlreadyReportedError } from '../utilities/AlreadyReportedError';
import { PurgeManager } from './PurgeManager';
import { RushConfiguration } from '../api/RushConfiguration'
import { RushGlobalFolder } from '../api/RushGlobalFolder';

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
        console.log(colors.red(
          'Workspaces are only supported in Rush for PNPM >=4.14.3. Upgrade PNPM to use the workspaces feature.'
        ));
        throw new AlreadyReportedError();
      }

      return new WorkspaceInstallManager(rushConfiguration, rushGlobalFolder, purgeManager, options);
    }

    return new RushInstallManager(rushConfiguration, rushGlobalFolder, purgeManager, options);
  }
}
