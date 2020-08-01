// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

console.log('LinkManagerFactory.ts  : 1: ' + (new Date().getTime() % 20000) / 1000.0);
import { RushConfiguration } from '../api/RushConfiguration';
console.log('LinkManagerFactory.ts  : 2: ' + (new Date().getTime() % 20000) / 1000.0);
import { BaseLinkManager } from './base/BaseLinkManager';
console.log('LinkManagerFactory.ts  : 3: ' + (new Date().getTime() % 20000) / 1000.0);
import { NpmLinkManager } from './npm/NpmLinkManager';
console.log('LinkManagerFactory.ts  : 4: ' + (new Date().getTime() % 20000) / 1000.0);
import { PnpmLinkManager } from './pnpm/PnpmLinkManager';
console.log('LinkManagerFactory.ts  : 5: ' + (new Date().getTime() % 20000) / 1000.0);

export class LinkManagerFactory {
  public static getLinkManager(rushConfiguration: RushConfiguration): BaseLinkManager {
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
