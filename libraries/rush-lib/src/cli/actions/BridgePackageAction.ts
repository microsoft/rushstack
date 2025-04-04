// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { CommandLineStringParameter } from '@rushstack/ts-command-line';

import type { RushCommandLineParser } from '../RushCommandLineParser';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { BaseHotlinkPackageAction } from './BaseHotlinkPackageAction';
import type { HotlinkManager } from '../../utilities/HotlinkManager';
import { BRIDGE_PACKAGE_ACTION_NAME, LINK_PACKAGE_ACTION_NAME } from '../../utilities/actionNameConstants';

export class BridgePackageAction extends BaseHotlinkPackageAction {
  private readonly _version: CommandLineStringParameter;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: BRIDGE_PACKAGE_ACTION_NAME,
      summary:
        '(EXPERIMENTAL) Use hotlinks to simulate upgrade of a dependency for all consumers across a lockfile.',
      documentation:
        'This command enables you to test a locally built project by simulating its upgrade by updating' +
        ' node_modules folders using hotlinks.  Unlike "pnpm link" and "npm link", the hotlinks created by this' +
        ' command affect all Rush projects across the lockfile, as well as their indirect dependencies.  The' +
        ' simulated installation is not reflected in pnpm-lock.yaml, does not install new package.json dependencies,' +
        ' and simply updates the contents of existing node_modules folders of "rush install".' +
        '  The hotlinks will be cleared when you next run "rush install" or "rush update".' +
        `  Compare with the "rush ${LINK_PACKAGE_ACTION_NAME}" command, which affects only the consuming project.`,
      parser
    });

    this._version = this.defineStringParameter({
      parameterLongName: '--version',
      argumentName: 'SEMVER_RANGE',
      description:
        'Specify which installed versions should be hotlinked.  If omitted, the default is all versions ("*).'
    });
  }

  public async connectPackageAsync(
    consumerPackage: RushConfigurationProject,
    linkedPackagePath: string,
    hotlinkManager: HotlinkManager
  ): Promise<void> {
    const version: string | undefined = this._version.value;
    await hotlinkManager.bridgePackageAsync(this.terminal, consumerPackage, linkedPackagePath, version);
  }
}
