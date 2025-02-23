// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushCommandLineParser } from '../RushCommandLineParser';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { BaseConnectPackageAction } from './BaseConnectPackageAction';
import type { RushConnect } from '../../utilities/RushConnect';

export class LinkPackageAction extends BaseConnectPackageAction {
  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'link-package',
      summary: 'Enable access to another package under the current package.',
      documentation:
        'Using "rush link-package" will create a symbolic link of the target package in the "node_modules" folder ' +
        'of the current package, allowing access to the target package from the current package. ' +
        'However, it cannot resolve the issue of multiple instances caused by "peerDependencies".',
      safeForSimultaneousRushProcesses: true,
      parser
    });
  }

  public async connectPackageAsync(
    consumerPackage: RushConfigurationProject,
    linkedPackagePath: string,
    rushConnect: RushConnect
  ): Promise<void> {
    await rushConnect.linkPackageAsync(consumerPackage, linkedPackagePath);
  }
}
