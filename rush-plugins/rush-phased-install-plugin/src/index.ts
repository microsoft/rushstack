// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { writeFileSync, mkdirSync } from 'fs';

import type {
  RushConfiguration,
  RushSession,
  IRushPlugin,
  IPhasedCommand,
  IRushCommand
} from '@rushstack/rush-sdk';

class RushPhasedInstallPlugin implements IRushPlugin {
  public readonly pluginName: 'RushPhasedInstallPlugin' = 'RushPhasedInstallPlugin';
  public apply(session: RushSession, configuration: RushConfiguration): void {
    session.hooks.runAnyPhasedCommand.tapPromise(this.pluginName, async (action: IPhasedCommand) => {
      if (action.actionName.includes('phased-install')) {
        // Perform an asyn import so that booting Rush isn't slowed down by this plugin, even if it is registered
        const handler: typeof import('./phasedInstallHandler') = await import(
          /* webpackChunkName: 'handler' */
          /* webpackMode: 'eager' */
          /* webpackExports: ["apply"] */
          './phasedInstallHandler.js'
        );
        await handler.apply(this, session, configuration, action);
      }
    });
    // Exploit that the initialize hook runs before anything in the phased command
    session.hooks.initialize.tap(this.pluginName, (action: IRushCommand) => {
      if (action.actionName.includes('phased-install')) {
        // Rush checks for the marker flag file before allowing a phased command to proceed, so create it preemptively.
        const { commonTempFolder } = configuration;
        const flagPath: string = `${commonTempFolder}/last-link.flag`;
        session.terminalProvider.write(`Writing ${flagPath}\n`, 0);
        mkdirSync(commonTempFolder, { recursive: true });
        writeFileSync(flagPath, '{}', 'utf8');
      }
    });
  }
}

export default RushPhasedInstallPlugin;
