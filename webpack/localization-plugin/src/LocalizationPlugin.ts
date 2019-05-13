// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as Webpack from 'webpack';

/**
 * The options for localization.
 *
 * @public
 */
export interface ILocalizationPluginOptions {

}

/**
 * This plugin facilitates localization in webpack.
 *
 * @public
 */
export class LocalizationPlugin implements Webpack.Plugin {
  public options: ILocalizationPluginOptions;

  constructor(options: ILocalizationPluginOptions) {
    this.options = options;
  }

  public apply(compiler: Webpack.Compiler): void {
    const isWebpack4: boolean = !!compiler.hooks;

    if (!isWebpack4) {
      throw new Error('The localization plugin requires webpack 4');
    }

    compiler.hooks.compilation.tap('localization', (compilation: Webpack.compilation.Compilation) => {
      // Empty
    });
  }
}
