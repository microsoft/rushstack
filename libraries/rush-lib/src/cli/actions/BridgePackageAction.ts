// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushCommandLineParser } from '../RushCommandLineParser';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { BaseSymlinkPackageAction } from './BaseSymlinkPackageAction';
import type { RushConnect } from '../../utilities/RushConnect';
import type { CommandLineStringParameter } from '@rushstack/ts-command-line';

export class BridgePackageAction extends BaseSymlinkPackageAction {
  private readonly _version: CommandLineStringParameter;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'bridge-package',
      summary: '(EXPERIMENTAL) Simulate installation of a locally built project, affecting many projects.',
      documentation:
        'This command enables you to test a locally built project by simulating its installation under the Rush' +
        ' workspace node_modules folders.  Unlike "pnpm link" and "npm link", this command updates all installation' +
        ' doppelgangers for the specified version range, potentially affecting multiple projects across the' +
        ' workspace, as well as their indirect dependencies. The symlink is not reflected in pnpm-lock.yaml, and ' +
        " ignores the local project's own package.json dependencies, preserving whatever the lockfile installed." +
        '  The symlink will be cleared when you next run "rush install" or "rush update".' +
        '  Compare with the "rush link-package" command, which affects only the consuming project.',
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
