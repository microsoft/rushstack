// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConfiguration } from '../api/RushConfiguration';
import { BaseLinkManager } from './base/BaseLinkManager';
import { NpmLinkManager } from './npm/NpmLinkManager';
import { PnpmLinkManager } from './pnpm/PnpmLinkManager';

export class LinkManagerFactory {
  public static getLinkManager(
    rushConfiguration: RushConfiguration
  ): BaseLinkManager {

    switch (rushConfiguration.packageManager) {
      case 'npm':
        return new NpmLinkManager(rushConfiguration);
      case 'pnpm':
        return new PnpmLinkManager(rushConfiguration);
      case 'yarn':
        // Yarn uses the same node_modules structure as NPM
        return new NpmLinkManager(rushConfiguration);
    }

    throw new Error(`Unsupported package manager: ${rushConfiguration.packageManager}`);
  }
}
