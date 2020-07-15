// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';

import { RushCommandLineParser } from '../RushCommandLineParser';
import { BaseRushAction } from './BaseRushAction';

export class LinkAction extends BaseRushAction {
  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'link',
      summary: 'Create node_modules symlinks for all projects',
      documentation:
        '(DEPRECATED) Create node_modules symlinks for all projects. This command is deprecated. To restore ' +
        'project node_modules folders, run "rush install" or "rush update".',
      parser
    });
  }

  protected onDefineParameters(): void {
    this.defineFlagParameter({
      parameterLongName: '--force',
      parameterShortName: '-f',
      description:
        'Deletes and recreates all links, even if the filesystem state seems to indicate that this is ' +
        'unnecessary.'
    });
  }

  protected async run(): Promise<void> {
    console.log(
      colors.red(
        'The "rush link" command has been deprecated. No action has been taken. Run "rush install" or ' +
          '"rush update" to restore project node_modules folders.'
      )
    );
  }
}
