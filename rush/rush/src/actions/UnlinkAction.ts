/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import CommandLineAction from '../commandLine/CommandLineAction';
import RushCommandLineParser from './RushCommandLineParser';
import RushConfig from '../data/RushConfig';
import Utilities from '../utilities/Utilities';

export default class UnlinkAction extends CommandLineAction {
  private _parser: RushCommandLineParser;
  private _rushConfig: RushConfig;

  constructor(parser: RushCommandLineParser) {
    super({
      actionVerb: 'unlink',
      summary: 'Delete node_modules symlinks for all projects',
      documentation: 'This removes the symlinks created by the "rush link" command,'
        + ' allowing you to resume use NPM commands instead of Rush.'
    });
    this._parser = parser;
  }

  protected onDefineParameters(): void {
    // No parameters
  }

  protected onExecute(): void {
    this._rushConfig = this._rushConfig = RushConfig.loadFromDefaultLocation();

    console.log('Starting "rush unlink"' + os.EOL);

    let didAnything: boolean = false;
    for (const rushProject of this._rushConfig.projects) {
      const localModuleFolder: string = path.join(rushProject.projectFolder, 'node_modules');
      if (fs.existsSync(localModuleFolder)) {
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
  }
}
