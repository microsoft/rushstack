import RushConfiguration from '../../data/RushConfiguration';
import { BaseLinkManager } from './base/BaseLinkManager';
import { NpmLinkManager } from './npm/NpmLinkManager';
import { PnpmLinkManager } from './pnpm/PnpmLinkManager';

export class LinkManagerFactory {
  public static getLinkManager(rushConfiguration: RushConfiguration): BaseLinkManager {
    if (rushConfiguration.packageManager === 'npm') {
      return new NpmLinkManager(rushConfiguration);
    } else if (rushConfiguration.packageManager === 'pnpm') {
      return new PnpmLinkManager(rushConfiguration);
    }
    throw new Error(`Invalid package manager: ${rushConfiguration.packageManager}`);
  }
}