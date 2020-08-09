// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem } from '@rushstack/node-core-library';
import * as child_process from 'child_process';
import * as path from 'path';
import { LauncherAction } from './LauncherAction';

export class Rundown {
  public static invoke(
    action: LauncherAction,
    scriptPath: string,
    args: ReadonlyArray<string>,
    traceImports: boolean
  ): void {
    if (!FileSystem.exists(scriptPath)) {
      throw new Error('The specified script path does not exist: ' + scriptPath);
    }
    const absoluteScriptPath: string = path.resolve(scriptPath);

    // Example process.argv:
    // ["path/to/launcher.js", "snapshot", "rundown.log", "path/to/target-script.js", "first-target-arg"]
    const nodeArgs: string[] = [
      path.join(__dirname, 'launcher.js'),
      action,
      'rundown.log',
      absoluteScriptPath,
      ...args
    ];

    const result: child_process.SpawnSyncReturns<string> = child_process.spawnSync(
      process.execPath,
      nodeArgs,
      {
        stdio: 'inherit',
        encoding: 'utf8'
      }
    );

    if (result.error) {
      throw result.error;
    }
  }
}
