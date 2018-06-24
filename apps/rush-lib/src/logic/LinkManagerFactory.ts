// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConfiguration } from '../api/RushConfiguration';
import { BaseLinkManager, IBaseLinkManagerOptions } from './base/BaseLinkManager';
import { NpmLinkManager } from './npm/NpmLinkManager';
import { PnpmLinkManager } from './pnpm/PnpmLinkManager';

export class LinkManagerFactory {
  public static getLinkManager(
    rushConfiguration: RushConfiguration,
    options: IBaseLinkManagerOptions
  ): BaseLinkManager {

    switch (rushConfiguration.packageManager) {
      case 'npm':
        return new NpmLinkManager(rushConfiguration, options);
      case 'pnpm':
        return new PnpmLinkManager(rushConfiguration, options);
      case 'yarn':
        // Yarn uses the same node_modules structure as NPM
        return new NpmLinkManager(rushConfiguration, options);
    }

    throw new Error(`Unsupported package manager: ${rushConfiguration.packageManager}`);
  }
}
