import { LastInstallFlag } from './LastInstallFlag';
import { RushConfiguration } from './RushConfiguration';

export class RushLastInstallFlag extends LastInstallFlag {
  constructor(rushConfiguration: RushConfiguration) {
    super(rushConfiguration.commonTempFolder, {
      node: process.versions.node,
      packageManager: rushConfiguration.packageManager,
      packageManagerVersion: rushConfiguration.packageManagerToolVersion
    });
  }
}
