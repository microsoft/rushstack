// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { WorkspaceInstallManager } from './installManager/WorkspaceInstallManager.ts';
import type { PurgeManager } from './PurgeManager.ts';
import type { RushConfiguration } from '../api/RushConfiguration.ts';
import type { RushGlobalFolder } from '../api/RushGlobalFolder.ts';
import type { BaseInstallManager } from './base/BaseInstallManager.ts';
import type { IInstallManagerOptions } from './base/BaseInstallManagerTypes.ts';

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

    const rushInstallManagerModule: typeof import('./installManager/RushInstallManager.ts') = await import(
      /* webpackChunkName: 'RushInstallManager' */
      './installManager/RushInstallManager.ts'
    );
    return new rushInstallManagerModule.RushInstallManager(
      rushConfiguration,
      rushGlobalFolder,
      purgeManager,
      options
    );
  }
}
