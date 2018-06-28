// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as childProcess from 'child_process';

import { GulpTask } from '@microsoft/gulp-core-build';

/**
 * @public
 */
export abstract class BaseCmdTask<TTaskConfig> extends GulpTask<TTaskConfig> {
  protected _callCmd(binaryPath: string, cwd: string, args: string[]): Promise<void> {
    return new Promise((resolve: () => void, reject: (error: Error) => void) => {
      // Invoke the tool and watch for log messages
      const spawnResult: childProcess.ChildProcess = childProcess.spawn(
        'node',
        [binaryPath, ...args] ,
        {
          cwd,
          env: process.env,
          stdio: 'pipe'
        }
      );

      let hasErrors: boolean = false;
      spawnResult.stderr.on('data', (chunk: Buffer) => {
        this._logChunk(chunk, this.logError);
        hasErrors = true;
      });

      spawnResult.stdout.on('data', (chunk: Buffer) => {
        this._logChunk(chunk, this.log);
      });

      spawnResult.on('close', (code: number) => {
        if (code !== 0 || hasErrors) {
          reject(new Error(`exited with code ${code}`));
        } else {
          resolve();
        }
      });
    });
  }

  private _logChunk(chunk: Buffer, logFn: (message: string) => void): void {
    const chunkStr: string = chunk.toString().trim();
    logFn.call(this, chunkStr);
  }
}
