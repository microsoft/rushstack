// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as webpack from 'webpack';

const PLUGIN_NAME: 'PreserveDynamicRequireWebpackPlugin' = 'PreserveDynamicRequireWebpackPlugin';

/**
 * @public
 */
export class PreserveDynamicRequireWebpackPlugin {
  public apply(compiler: webpack.Compiler): void {
    compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation: webpack.Compilation) => {
      function processDependencies(
        block: Pick<webpack.AsyncDependenciesBlock, 'dependencies' | 'blocks'>
      ): void {
        const { dependencies } = block;
        for (let i: number = dependencies.length - 1; i >= 0; i--) {
          const dep: webpack.Dependency = dependencies[i];
          // Disable processing of dynamic require
          if (dep.constructor.name === 'CommonJsRequireContextDependency') {
            dependencies.splice(i, 1);
          }
        }

        for (const child of block.blocks) {
          processDependencies(child);
        }
      }

      compilation.hooks.succeedModule.tap(PLUGIN_NAME, (mod: webpack.Module) => {
        processDependencies(mod);
      });
    });
  }
}
