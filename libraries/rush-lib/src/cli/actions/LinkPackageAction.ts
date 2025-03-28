// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushCommandLineParser } from '../RushCommandLineParser';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { BaseSymlinkPackageAction } from './BaseSymlinkPackageAction';
import type { RushConnect } from '../../utilities/RushConnect';

export class LinkPackageAction extends BaseSymlinkPackageAction {
  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'link-package',
      summary:
        '(EXPERIMENTAL) Simulate installation of a locally built project, affecting specific projects.',
      documentation:
        'This command enables you to test a locally built project by creating a symlink under a consuming' +
        ' project\'s node_modules folder to simulate installation.  The implementation is similar to "pnpm link"' +
        ' and "npm link", but better integrated with Rush features.  Like those commands, the symlink is' +
        ' not reflected in pnpm-lock.yaml, affects the consuming project only, and has the same limitations as' +
        ' "workspace:*".' +
        '  The symlink will be cleared when you next run "rush install" or "rush update".' +
        '  Compare with the "rush bridge-package" command, which affects multiple projects and indirect dependencies.',
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
