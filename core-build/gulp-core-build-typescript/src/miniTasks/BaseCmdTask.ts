// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as childProcess from 'child_process';

import { GulpTask } from '@microsoft/gulp-core-build';

export interface ICallCmdOptions {
  onData: (chunk: Buffer) => void;
  onError: (chunk: Buffer) => void;
  onClose: (code: number, hasErrors: boolean, resolve: () => void, reject: (error: Error) => void) => void;
}

/**
 * @public
 */
export abstract class BaseCmdTask<TTaskConfig> extends GulpTask<TTaskConfig> {
  protected _callCmd(
    binaryPath: string,
    cwd: string,
    args: string[],
    options?: Partial<ICallCmdOptions>
  ): Promise<void> {
    options = options || {};
    const promiseHandlers: ICallCmdOptions = {} as ICallCmdOptions;

    promiseHandlers.onData = options.onData
      ? options.onData
      : (data: Buffer) => {
          this._logBuffer(data, this.log);
        };

    promiseHandlers.onError = options.onError
      ? options.onError
      : (data: Buffer) => {
          this._logBuffer(data, this.logError);
        };

    promiseHandlers.onClose = options.onClose
      ? options.onClose
      : (code: number, hasErrors: boolean, resolve: () => void, reject: (error: Error) => void) => {
          if (code !== 0 || hasErrors) {
            reject(new Error(`exited with code ${code}`));
          } else {
            resolve();
          }
        };

    return new Promise((resolve: () => void, reject: (error: Error) => void) => {
      // Invoke the tool and watch for log messages
      const spawnResult: childProcess.ChildProcess = childProcess.spawn(
        'node',
        [binaryPath, ...args],
        {
          cwd,
          env: process.env,
          stdio: 'pipe'
        }
      );

      let hasErrors: boolean = false;
      spawnResult.stdout.on('data', promiseHandlers.onData);
      spawnResult.stderr.on('data', (chunk: Buffer) => {
        hasErrors = true;
        promiseHandlers.onError(chunk);
      });

      spawnResult.on('close', (code) => promiseHandlers.onClose(code, hasErrors, resolve, reject));
    });
  }

  protected _logBuffer(data: Buffer, logFn: (message: string) => void): void {
    const chunkStr: string = data.toString().trim();
    logFn.call(this, chunkStr);
  }
}
