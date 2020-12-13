// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { IHeftPlugin, HeftSession, HeftConfiguration, ScopedLogger } from '@rushstack/heft';
import { FileSystem } from '@rushstack/node-core-library';

class HeftActionPlugin implements IHeftPlugin {
  public readonly pluginName: string = 'heft-action-plugin';

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    interface IMyCustomActionParameters {
      production: boolean;
    }

    heftSession.registerAction<IMyCustomActionParameters>({
      actionName: 'my-custom-action',
      documentation: 'An example custom action',
      parameters: {
        production: {
          kind: 'flag',
          paramterLongName: '--production',
          description: 'Run in production mode'
        }
      },
      callback: async ({ production }) => {
        const logger: ScopedLogger = heftSession.requestScopedLogger('custom-action');
        const customActionOutput: string = `production: ${production}`;
        logger.terminal.writeLine(
          `!!!!!!!!!!!!!! Custom action executing (${customActionOutput}) !!!!!!!!!!!!!!`
        );

        await FileSystem.writeFileAsync(
          path.join(heftConfiguration.buildFolder, 'dist', 'custom-action-output'),
          customActionOutput,
          { ensureFolderExists: true }
        );
      }
    });
  }
}

export default new HeftActionPlugin();
