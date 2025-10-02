// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Import } from '@rushstack/node-core-library';
import type { IRushPlugin, RushSession, RushConfiguration } from '@rushstack/rush-sdk';

import type { IRedisCobuildLockProviderOptions, RedisCobuildLockProvider } from './RedisCobuildLockProvider';

const RedisCobuildLockProviderModule: typeof import('./RedisCobuildLockProvider') = Import.lazy(
  './RedisCobuildLockProvider',
  require
);

const PLUGIN_NAME: string = 'RedisCobuildPlugin';

/**
 * @public
 */
export type IRushRedisCobuildPluginOptions = IRedisCobuildLockProviderOptions;

/**
 * @public
 */
export class RushRedisCobuildPlugin implements IRushPlugin {
  public pluginName: string = PLUGIN_NAME;

  private _options: IRushRedisCobuildPluginOptions;

  public constructor(options: IRushRedisCobuildPluginOptions) {
    this._options = options;
  }

  public apply(rushSession: RushSession, rushConfiguration: RushConfiguration): void {
    rushSession.hooks.initialize.tap(PLUGIN_NAME, () => {
      rushSession.registerCobuildLockProviderFactory('redis', (): RedisCobuildLockProvider => {
        const options: IRushRedisCobuildPluginOptions = this._options;
        return new RedisCobuildLockProviderModule.RedisCobuildLockProvider(options, rushSession);
      });
    });
  }
}
