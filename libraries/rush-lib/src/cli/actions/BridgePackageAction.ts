// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushCommandLineParser } from '../RushCommandLineParser';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { BaseConnectPackageAction } from './BaseConnectPackageAction';

export class BridgePackageAction extends BaseConnectPackageAction {
  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'bridge-package',
      summary: 'Enable access to another package under the current package.',
      documentation:
        'Using “rush bridge-package” allows the target package to be accessed from the current package. ' +
        'Compared to "rush link-package", "rush bridge-package" is designed to address the issues ' +
        'caused by "peerDependencies", making it closer to the pattern of installing third-party dependencies.',
      safeForSimultaneousRushProcesses: true,
      parser
    });
  }

  public async connectPackageAsync(
    consumerPackage: RushConfigurationProject,
    linkedPackagePath: string
  ): Promise<void> {
    await this._rushConnect.bridgePackageAsync(consumerPackage, linkedPackagePath);
  }
}
