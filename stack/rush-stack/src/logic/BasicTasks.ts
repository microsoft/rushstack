// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as child_process from 'child_process';

import { BuildContext } from './BuildContext';
import { FileSystem } from '@microsoft/node-core-library';

export class BasicTasks {
  /**
   * Build task: Cleans all the temporary files
   */
  public static doClean(buildContext: BuildContext): void {
    const foldersToClean: string[] = ['temp', 'lib', 'dist'];

    for (const folderToClean of foldersToClean) {
      const fullPath: string = path.join(buildContext.projectFolder, folderToClean);
      console.log(`[clean]: Cleaning "${fullPath}"`);
      FileSystem.ensureEmptyFolder(fullPath);
    }
  }

  /**
   * Build task: Runs the typescript compiler
   */
  public static doBuild(buildContext: BuildContext): void {
    console.log(`[clean]: Starting`);
    const tscPath: string = path.join(buildContext.projectFolder, 'node_modules/.bin/rush-tsc');
    child_process.execSync(tscPath, { stdio: 'inherit' });
    console.log(`[clean]: Finished`);
  }
}
