// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushCommandLineParser } from '../RushCommandLineParser.ts';
import { BaseRushAction } from './BaseRushAction.ts';
import { UnlinkManager } from '../../logic/UnlinkManager.ts';

export class UnlinkAction extends BaseRushAction {
  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'unlink',
      summary: 'Delete node_modules symlinks for all projects in the repo',
      documentation:
        'This removes the symlinks created by the "rush link" command. This is useful for' +
        ' cleaning a repo using "git clean" without accidentally deleting source files, or for using standard NPM' +
        ' commands on a project.',
      parser
    });
  }

  protected async runAsync(): Promise<void> {
    const unlinkManager: UnlinkManager = new UnlinkManager(this.rushConfiguration);

    if (!(await unlinkManager.unlinkAsync())) {
      // eslint-disable-next-line no-console
      console.log('Nothing to do.');
    } else {
      // eslint-disable-next-line no-console
      console.log('\nDone.');
    }
  }
}
