// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { CommandLineStringParameter } from '@rushstack/ts-command-line';

import type { RushCommandLineParser } from '../RushCommandLineParser';
import { BaseHotlinkPackageAction } from './BaseHotlinkPackageAction';
import type { HotlinkManager } from '../../utilities/HotlinkManager';
import { BRIDGE_PACKAGE_ACTION_NAME, LINK_PACKAGE_ACTION_NAME } from '../../utilities/actionNameConstants';
import { RushConstants } from '../../logic/RushConstants';
import type { Subspace } from '../../api/Subspace';

export class BridgePackageAction extends BaseHotlinkPackageAction {
  private readonly _versionParameter: CommandLineStringParameter;
  private readonly _subspaceNameParameter: CommandLineStringParameter;

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

    this._versionParameter = this.defineStringParameter({
      parameterLongName: '--version',
      argumentName: 'SEMVER_RANGE',
      defaultValue: '*',
      description:
        'Specify which installed versions should be hotlinked.'
    });

    this._subspaceNameParameter = this.defineStringParameter({
      parameterLongName: '--subspace',
      argumentName: 'SUBSPACE',
      defaultValue: RushConstants.defaultSubspaceName,
      description: 'The name of the subspace to use for the bridge package.'
    });
  }

  protected async hotlinkPackageAsync(
    linkedPackagePath: string,
    hotlinkManager: HotlinkManager
  ): Promise<void> {
    const version: string = this._versionParameter.value!;
    const subspace: Subspace = this.rushConfiguration.getSubspace(this._subspaceNameParameter.value!);
    await hotlinkManager.bridgePackageAsync(this.terminal, subspace, linkedPackagePath, version);
  }
}
