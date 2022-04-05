// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IRushPlugin, RushSession, RushConfiguration, IPhasedCommand } from '@rushstack/rush-sdk';
import { PLUGIN_NAME } from './constants';

export interface IRushServePluginOptions {
  /**
   * The names of phased commands to which the plugin should be applied.
   */
  phasedCommands: ReadonlyArray<string>;
  /**
   * The name of a parameter that Rush is configured to use to pass a port number to underlying operations.
   * If specified, the plugin will ensure the value is synchronized with the port used for its server.
   */
  portParameterLongName?: string | undefined;
}

/**
 * @public
 */
export class RushServePlugin implements IRushPlugin {
  public readonly pluginName: 'RushServePlugin' = PLUGIN_NAME;

  private readonly _phasedCommands: Set<string>;
  private readonly _portParameterLongName: string | undefined;

  public constructor(options: IRushServePluginOptions) {
    this._phasedCommands = new Set(options.phasedCommands);
    this._portParameterLongName = options.portParameterLongName;
  }

  public apply(rushSession: RushSession, rushConfiguration: RushConfiguration): void {
    const handler: (command: IPhasedCommand) => Promise<void> = async (command: IPhasedCommand) => {
      // Defer importing the implementation until this plugin is actually invoked.
      await (
        await import('./phasedCommandHandler')
      ).phasedCommandHandler({
        rushSession,
        rushConfiguration,
        command,
        portParameterLongName: this._portParameterLongName
      });
    };

    for (const commandName of this._phasedCommands) {
      // Only activate the plugin for the commands requested in the config
      rushSession.hooks.runPhasedCommand.for(commandName).tapPromise(PLUGIN_NAME, handler);
    }
  }
}

export default RushServePlugin;
