// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushCommandLineParser } from '../RushCommandLineParser';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { BaseConnectPackageAction } from './BaseConnectPackageAction';
import type { RushConnect } from '../../utilities/RushConnect';
import type { CommandLineStringParameter } from '@rushstack/ts-command-line';

export class BridgePackageAction extends BaseConnectPackageAction {
  private readonly _version: CommandLineStringParameter;

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

    this._version = this.defineStringParameter({
      parameterLongName: '--version',
      argumentName: 'VERSION',
      description:
        'It will directly replace the output for the specified version of the package, which requires you to have that package installed under the specified name in advance.'
    });
  }

  public async connectPackageAsync(
    consumerPackage: RushConfigurationProject,
    linkedPackagePath: string,
    rushConnect: RushConnect
  ): Promise<void> {
    const version: string | undefined = this._version.value;
    await rushConnect.bridgePackageAsync(consumerPackage, linkedPackagePath, version);
  }
}
