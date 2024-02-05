// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Compilation, Compiler, WebpackPluginInstance } from 'webpack';

import { LocalizationPlugin } from '../LocalizationPlugin';
import { type HashFn, getHashFunction, updateAssetHashes } from '../trueHashes';

const PLUGIN_NAME: 'true-hash' = 'true-hash';

export interface ITrueHashPluginOptions {
  /**
   * A function that takes the contents of a file and returns a hash.
   */
  hashFunction?: (contents: string | Buffer) => string;
}

export class TrueHashPlugin implements WebpackPluginInstance {
  private readonly _options: ITrueHashPluginOptions;

  public constructor(options: ITrueHashPluginOptions = {}) {
    this._options = options;
  }

  public apply(compiler: Compiler): void {
    compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation: Compilation) => {
      const { webpack: thisWebpack } = compiler;

      let hasLocalizationPluginTrueHashOption: boolean = false;
      if (compiler.options.plugins) {
        for (const plugin of compiler.options.plugins) {
          if (plugin instanceof LocalizationPlugin && plugin._options.useTrueHashes) {
            hasLocalizationPluginTrueHashOption = true;
            break;
          }
        }
      }

      if (hasLocalizationPluginTrueHashOption) {
        compilation.warnings.push(
          new thisWebpack.WebpackError(
            `The ${TrueHashPlugin.name} is not compatible with the LocalizationPlugin's "useTrueHashes" option. ` +
              `Because the LocalizationPlugin is already handling true hashes, the ${TrueHashPlugin.name} plugin ` +
              'will have no effect.'
          )
        );
      } else {
        const { hashFunction } = this._options;
        const hashFn: HashFn =
          hashFunction ??
          getHashFunction({
            thisWebpack,
            compilation
          });

        compilation.hooks.processAssets.tap(
          {
            name: PLUGIN_NAME,
            stage: thisWebpack.Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE
          },
          () => updateAssetHashes({ thisWebpack, compilation, hashFn })
        );
      }
    });
  }
}
