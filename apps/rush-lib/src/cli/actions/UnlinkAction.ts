// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';

import { RushCommandLineParser } from '../RushCommandLineParser';
import { BaseRushAction } from './BaseRushAction';
import { AlreadyReportedError } from '../../utilities/AlreadyReportedError';

export class UnlinkAction extends BaseRushAction {
  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'unlink',
      summary: 'Delete node_modules symlinks for all projects in the repo',
      documentation:
        '(DEPRECATED) This removes the symlinks created by the "rush link" command. This command is deprecated.' +
        'To delete node_modules symlinks, run "rush purge".',
      parser
    });
  }

  protected onDefineParameters(): void {
    // No parameters
  }

  protected run(): Promise<void> {
    console.log(
      colors.red(
        'The "rush unlink" command has been deprecated. No action has been taken. Run "rush purge" to ' +
          'remove project "node_modules" folders.'
      )
    );
    throw new AlreadyReportedError();
  }
}
