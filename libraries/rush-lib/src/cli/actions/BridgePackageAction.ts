// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  CommandLineStringListParameter,
  IRequiredCommandLineStringParameter
} from '@rushstack/ts-command-line';
import { Async } from '@rushstack/node-core-library';

import type { RushCommandLineParser } from '../RushCommandLineParser.ts';
import { BaseHotlinkPackageAction } from './BaseHotlinkPackageAction.ts';
import type { HotlinkManager } from '../../utilities/HotlinkManager.ts';
import { BRIDGE_PACKAGE_ACTION_NAME, LINK_PACKAGE_ACTION_NAME } from '../../utilities/actionNameConstants.ts';
import { RushConstants } from '../../logic/RushConstants.ts';
import type { Subspace } from '../../api/Subspace.ts';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject.ts';

export class BridgePackageAction extends BaseHotlinkPackageAction {
  private readonly _versionParameter: IRequiredCommandLineStringParameter;
  private readonly _subspaceNamesParameter: CommandLineStringListParameter;

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
      description: 'Specify which installed versions should be hotlinked.'
    });

    this._subspaceNamesParameter = this.defineStringListParameter({
      parameterLongName: '--subspace',
      argumentName: 'SUBSPACE_NAME',
      description: 'The name of the subspace to use for the hotlinked package.'
    });
  }

  private _getSubspacesToBridgeAsync(): Set<Subspace> {
    const subspaceToBridge: Set<Subspace> = new Set();
    const subspaceNames: readonly string[] = this._subspaceNamesParameter.values;

    if (subspaceNames.length > 0) {
      for (const subspaceName of subspaceNames) {
        const subspace: Subspace | undefined = this.rushConfiguration.tryGetSubspace(subspaceName);
        if (!subspace) {
          throw new Error(
            `The subspace "${subspaceName}" was not found in "${RushConstants.rushPackageName}"`
          );
        }
        subspaceToBridge.add(subspace);
      }
    } else {
      const currentProject: RushConfigurationProject | undefined =
        this.rushConfiguration.tryGetProjectForPath(process.cwd());
      if (!currentProject) {
        throw new Error(`No Rush project was found in the current working directory`);
      }
      subspaceToBridge.add(currentProject.subspace);
    }

    return subspaceToBridge;
  }

  protected async hotlinkPackageAsync(
    linkedPackagePath: string,
    hotlinkManager: HotlinkManager
  ): Promise<void> {
    const version: string = this._versionParameter.value;
    const subspaces: Set<Subspace> = await this._getSubspacesToBridgeAsync();
    await Async.forEachAsync(
      subspaces,
      async (subspace) => {
        await hotlinkManager.bridgePackageAsync(this.terminal, subspace, linkedPackagePath, version);
      },
      { concurrency: 5 }
    );
  }
}
