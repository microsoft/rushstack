// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IRushPlugin, RushSession, RushConfiguration } from '@rushstack/rush-sdk';

const PLUGIN_NAME: string = 'VscodePublishPlugin';

/**
 * @public
 */
export class RushVscodePublishPlugin implements IRushPlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  public apply(rushSession: RushSession, rushConfiguration: RushConfiguration): void {
    rushSession.hooks.initialize.tap(this.pluginName, () => {
      rushSession.registerPublishProviderFactory('vsix', async () => {
        const { VsixPublishProvider } = await import('./VsixPublishProvider');
        return new VsixPublishProvider();
      });
    });
  }
}
