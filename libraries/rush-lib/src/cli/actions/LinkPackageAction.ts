// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushCommandLineParser } from '../RushCommandLineParser';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { BaseHotlinkPackageAction } from './BaseHotlinkPackageAction';
import type { HotlinkManager } from '../../utilities/HotlinkManager';
import { BRIDGE_PACKAGE_ACTION_NAME, LINK_PACKAGE_ACTION_NAME } from '../../utilities/actionNameConstants';

export class LinkPackageAction extends BaseHotlinkPackageAction {
  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: LINK_PACKAGE_ACTION_NAME,
      summary:
        '(EXPERIMENTAL) Use hotlinks to simulate installation of a locally built project folder as a dependency' +
        ' of specific projects.',
      documentation:
        'This command enables you to test a locally built project by creating a symlink under the specified' +
        ' projects\' node_modules folders.  The implementation is similar to "pnpm link" and "npm link", but' +
        ' better integrated with Rush features.  Like those commands, the symlink ("hotlink") is not reflected' +
        ' in pnpm-lock.yaml, affects the consuming project only, and has the same limitations as "workspace:*".' +
        '  The hotlinks will be cleared when you next run "rush install" or "rush update".' +
        `  Compare with the "rush ${BRIDGE_PACKAGE_ACTION_NAME}" command, which affects the entire lockfile` +
        ' including indirect dependencies.',
      parser
    });
  }

  public async connectPackageAsync(
    consumerPackage: RushConfigurationProject,
    linkedPackagePath: string,
    hotlinkManager: HotlinkManager
  ): Promise<void> {
    await hotlinkManager.linkPackageAsync(this.terminal, consumerPackage, linkedPackagePath);
  }
}
