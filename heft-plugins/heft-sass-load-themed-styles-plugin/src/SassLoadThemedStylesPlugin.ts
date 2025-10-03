// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { HeftConfiguration, IHeftTaskPlugin, IHeftTaskSession } from '@rushstack/heft';
import type { SassPluginName, ISassPluginAccessor } from '@rushstack/heft-sass-plugin';
import { replaceTokensWithVariables } from '@microsoft/load-themed-styles';

const PLUGIN_NAME: 'sass-load-themed-styles-plugin' = 'sass-load-themed-styles-plugin';
const SASS_PLUGIN_NAME: typeof SassPluginName = 'sass-plugin';

export default class SassLoadThemedStylesPlugin implements IHeftTaskPlugin<void> {
  public apply(heftSession: IHeftTaskSession, heftConfiguration: HeftConfiguration): void {
    heftSession.requestAccessToPluginByName(
      '@rushstack/heft-sass-plugin',
      SASS_PLUGIN_NAME,
      (accessor: ISassPluginAccessor) => {
        accessor.hooks.postProcessCss.tap(PLUGIN_NAME, (cssText: string) => {
          return replaceTokensWithVariables(cssText);
        });
      }
    );
  }
}
