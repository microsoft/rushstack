// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ChildProcess } from 'child_process';
import type { HeftConfiguration } from '../configuration/HeftConfiguration';
import type { IHeftTaskSession } from '../pluginFramework/HeftTaskSession';
import type { IHeftTaskPlugin } from '../pluginFramework/IHeftPlugin';
import { spawnIsolatedProcess } from './processIsolation';

export const PLUGIN_NAME: string = 'set-environment-variables-plugin';

export interface ISetEnvironmentVariablesPluginOptions {
  environmentVariablesToSet: Record<string, string>;
}

export default class SetEnvironmentVariablesPlugin
  implements IHeftTaskPlugin<ISetEnvironmentVariablesPluginOptions>
{
  public async apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    { environmentVariablesToSet }: ISetEnvironmentVariablesPluginOptions
  ): Promise<void> {
    const childProcess: ChildProcess = await spawnIsolatedProcess(environmentVariablesToSet);

    try {
      if (childProcess.stdout) {
        childProcess.stdout.on('data', (data: Buffer) =>
          taskSession.logger.terminal.writeLine(data.toString())
        );
      }
      if (childProcess.stderr) {
        childProcess.stderr.on('data', (data: Buffer) =>
          taskSession.logger.terminal.writeErrorLine(data.toString())
        );
      }

      // Wait for the child process to exit
      await new Promise<void>((resolve, reject) => {
        childProcess.on('exit', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Process exited with code ${code}`));
          }
        });
      });
    } finally {
      childProcess.kill(); // Ensure cleanup
    }
  }
}
