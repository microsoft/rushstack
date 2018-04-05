// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as path from 'path';

import { BuildContext } from './BuildContext';

export class BasicTasks {
  public static doClean(buildContext: BuildContext): void {
    const foldersToClean: string[] = [
      'temp',
      'lib',
      'dist'
    ];

    for (const folderToClean of foldersToClean) {
      const fullPath: string = path.join(buildContext.projectFolder, folderToClean);
      console.log(`Cleaning folder: "${fullPath}"`);
      fsx.emptyDirSync(fullPath);
    }
  }
}
