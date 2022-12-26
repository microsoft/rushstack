// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IHeftLifecyclePlugin, IHeftLifecycleSession } from '@rushstack/heft';

const PLUGIN_NAME: string = 'suppress-browserslist-warning-plugin';

export default class SuppressBrowserslistWarningPlugin implements IHeftLifecyclePlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  public apply(heftSession: IHeftLifecycleSession): void {
    heftSession.hooks.toolStart.tap(
      {
        name: PLUGIN_NAME,
        stage: Number.MIN_SAFE_INTEGER
      },
      () => {
        // Prevent time-based browserslist update warning
        // See https://github.com/microsoft/rushstack/issues/2981
        process.env.BROWSERSLIST_IGNORE_OLD_DATA = '1';
      }
    );
  }
}
