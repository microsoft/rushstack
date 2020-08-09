// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem } from '@rushstack/node-core-library';
import * as child_process from 'child_process';
import * as path from 'path';

export class Rundown {
  public static invoke(scriptPath: string, trace: boolean, args: ReadonlyArray<string>): void {
    if (!FileSystem.exists(scriptPath)) {
      throw new Error('The specified script path does not exist: ' + scriptPath);
    }
    const absoluteScriptPath: string = path.resolve(scriptPath);

    const nodeArgs: string[] = [
      path.join(__dirname, 'launcher.js'),
      absoluteScriptPath,
      'rundown.log',
      trace ? '1' : '0',
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
