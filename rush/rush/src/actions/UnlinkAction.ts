// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { CommandLineAction } from '@microsoft/ts-command-line';
import {
  RushConfiguration,
  Utilities
} from '@microsoft/rush-lib';

import RushCommandLineParser from './RushCommandLineParser';

export default class UnlinkAction extends CommandLineAction {
  private _parser: RushCommandLineParser;
  private _rushConfiguration: RushConfiguration;

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
    this._rushConfiguration = this._rushConfiguration = RushConfiguration.loadFromDefaultLocation();

    console.log('Starting "rush unlink"' + os.EOL);

    let didAnything: boolean = false;
    for (const rushProject of this._rushConfiguration.projects) {
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
  }
}
