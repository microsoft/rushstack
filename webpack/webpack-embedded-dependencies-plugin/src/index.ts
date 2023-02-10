// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Compiler, WebpackPluginInstance } from 'webpack';

const PLUGIN_NAME: 'EmbeddedDependenciesWebpackPlugin' = 'EmbeddedDependenciesWebpackPlugin';

export default class EmbeddedDependenciesWebpackPlugin implements WebpackPluginInstance {
  public apply(compiler: Compiler): void {
    compiler.hooks.run.tapAsync(PLUGIN_NAME, (compiler: Compiler, callback) => {
      console.log('EmbeddedDependenciesWebpackPlugin: run');

      callback();
    });
  }
}
