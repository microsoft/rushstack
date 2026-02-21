// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Compilation, Compiler, WebpackPluginInstance } from 'webpack';

import { type HashFn, getHashFunction, updateAssetHashes } from './trueHashes.ts';

const PLUGIN_NAME: 'true-hash' = 'true-hash';

/**
 * @public
 */
export interface ITrueHashPluginOptions {
  /**
   * A function that takes the contents of a file and returns a hash.
   */
  hashFunction?: (contents: string | Buffer) => string;

  /**
   * Optionally override the process assets stage for this plugin.
   */
  stageOverride?: number;
}

/**
 * @public
 */
export class TrueHashPlugin implements WebpackPluginInstance {
  private readonly _options: ITrueHashPluginOptions;

  public constructor(options: ITrueHashPluginOptions = {}) {
    this._options = options;
  }

  public apply(compiler: Compiler): void {
    compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation: Compilation) => {
      const { webpack: thisWebpack } = compiler;
      const { hashFunction, stageOverride = thisWebpack.Compilation.PROCESS_ASSETS_STAGE_DEV_TOOLING - 1 } =
        this._options;
      const hashFn: HashFn =
        hashFunction ??
        getHashFunction({
          thisWebpack,
          compilation
        });

      compilation.hooks.processAssets.tap(
        {
          name: PLUGIN_NAME,
          stage: stageOverride
        },
        () => updateAssetHashes({ thisWebpack, compilation, hashFn })
      );
    });
  }
}
