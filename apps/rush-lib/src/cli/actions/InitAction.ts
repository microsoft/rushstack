// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { RushCommandLineParser } from '../RushCommandLineParser';
import { BaseConfiglessRushAction } from './BaseRushAction';
import { AlreadyReportedError } from '../../utilities/AlreadyReportedError';
import { FileSystem } from '@microsoft/node-core-library';

export class InitAction extends BaseConfiglessRushAction {
  constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'init',
      summary: 'Initializes a new Rush repo',
      documentation: 'When invoked in an empty folder, this command provisions a standard'
        + ' set of config files to start managing projects using Rush.',
      parser
    });
  }

  protected onDefineParameters(): void {
    // abstract
  }

  protected run(): Promise<void> {
    const initFolder: string = process.cwd();
    if (!this._validateFolderIsEmpty(initFolder)) {
      return Promise.reject(new AlreadyReportedError());
    }

    return Promise.resolve();
  }

  private _validateFolderIsEmpty(initFolder: string): boolean {
    for (const itemName of FileSystem.readFolder(initFolder)) {
      if (itemName.substr(0, 1) === '.') {
        // Ignore any items that start with ".", for example ".git"
        continue;
      }

      const itemPath: string = path.join(initFolder, itemName);

      const stats: fs.Stats = FileSystem.getStatistics(itemPath);
      // Ignore any loose files in the current folder, e.g. "README.md"
      // or "CONTRIBUTING.md"
      if (stats.isDirectory()) {
        console.error(colors.red(`ERROR: Found a subdirectory: "${itemName}"`));
        console.log(os.EOL + 'The "rush init" command must be run in a new folder with no projects added yet.');
        return false;
      } else {
        if (itemName.toLowerCase() === 'package.json') {
          console.error(colors.red(`ERROR: Found a package.json file in this folder`));
          console.log(os.EOL + 'The "rush init" command must be run in a new folder with no projects added yet.');
          return false;
        }
      }
    }
    return true;
  }
}
