// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import Utilities from '../../utilities/Utilities';
import RushCommandLineParser from './RushCommandLineParser';
import { BaseRushAction } from './BaseRushAction';

export default class UnlinkAction extends BaseRushAction {
  private _parser: RushCommandLineParser;

  constructor(parser: RushCommandLineParser) {
    super({
      actionVerb: 'unlink',
      summary: 'Delete node_modules symlinks for all projects',
      documentation: 'This removes the symlinks created by the "rush link" command. This is useful for'
       + ' cleaning a repo using "git clean" without accidentally deleting source files, or for using standard npm'
       + ' commands on a project.'
    });
    this._parser = parser;
  }

  protected onDefineParameters(): void {
    // No parameters
  }

  protected run(): Promise<void> {
    // Delete the flag file if it exists; this will ensure that
    // a full "rush link" is required next time
    Utilities.deleteFile(this.rushConfiguration.rushLinkJsonFilename);

    let didAnything: boolean = false;
    for (const rushProject of this.rushConfiguration.projects) {
      const localModuleFolder: string = path.join(rushProject.projectFolder, 'node_modules');
      if (fsx.existsSync(localModuleFolder)) {
        console.log('Purging ' + localModuleFolder);
        Utilities.dangerouslyDeletePath(localModuleFolder);
        didAnything = true;
      }
    }
    if (!didAnything) {
      console.log('Nothing to do.');
    } else {
      console.log(os.EOL + 'Done.');
    }
    return Promise.resolve();
  }
}
