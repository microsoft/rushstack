// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';

import { RushCommandLineParser } from '../RushCommandLineParser';
import { BaseRushAction } from './BaseRushAction';
import { UnlinkManager } from '../../logic/UnlinkManager';

export class UnlinkAction extends BaseRushAction {
  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'unlink',
      summary: 'Delete node_modules symlinks for all projects in the repo',
      documentation:
        'This removes the symlinks created by the "rush link" command. This is useful for' +
        ' cleaning a repo using "git clean" without accidentally deleting source files, or for using standard NPM' +
        ' commands on a project.',
      parser,
    });
  }

  protected onDefineParameters(): void {
    // No parameters
  }

  protected run(): Promise<void> {
    return Promise.resolve().then(() => {
      const unlinkManager: UnlinkManager = new UnlinkManager(this.rushConfiguration);

      if (!unlinkManager.unlink()) {
        console.log('Nothing to do.');
      } else {
        console.log(os.EOL + 'Done.');
      }
    });
  }
}
