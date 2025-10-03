// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { WorkspaceInstallManager } from './installManager/WorkspaceInstallManager';
import type { PurgeManager } from './PurgeManager';
import type { RushConfiguration } from '../api/RushConfiguration';
import type { RushGlobalFolder } from '../api/RushGlobalFolder';
import type { BaseInstallManager } from './base/BaseInstallManager';
import type { IInstallManagerOptions } from './base/BaseInstallManagerTypes';

export class InstallManagerFactory {
  public static async getInstallManagerAsync(
    rushConfiguration: RushConfiguration,
    rushGlobalFolder: RushGlobalFolder,
    purgeManager: PurgeManager,
    options: IInstallManagerOptions
  ): Promise<BaseInstallManager> {
    if (
      rushConfiguration.isPnpm &&
      rushConfiguration.pnpmOptions &&
      rushConfiguration.pnpmOptions.useWorkspaces
    ) {
      return new WorkspaceInstallManager(rushConfiguration, rushGlobalFolder, purgeManager, options);
    }

    const rushInstallManagerModule: typeof import('./installManager/RushInstallManager') = await import(
      /* webpackChunkName: 'RushInstallManager' */
      './installManager/RushInstallManager'
    );
    return new rushInstallManagerModule.RushInstallManager(
      rushConfiguration,
      rushGlobalFolder,
      purgeManager,
      options
    );
  }
}
