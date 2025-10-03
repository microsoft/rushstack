// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type webpack from 'webpack';

import { VersionDetection } from '@rushstack/webpack-plugin-utilities';
import { PackageJsonLookup, type IPackageJson } from '@rushstack/node-core-library';

/**
 * @public
 */
export abstract class SetPublicPathPluginBase implements webpack.WebpackPluginInstance {
  private readonly _pluginName: string;

  public constructor(pluginName: string) {
    this._pluginName = pluginName;
  }

  public apply(compiler: webpack.Compiler): void {
    if (!VersionDetection.isWebpack5(compiler)) {
      const thisPackageJson: IPackageJson = PackageJsonLookup.loadOwnPackageJson(__dirname);
      throw new Error(
        `The ${this.constructor.name} plugin requires Webpack 5. Use major version 4 of ` +
          `${thisPackageJson.name} for Webpack 4 support.`
      );
    }

    const thisWebpack: typeof webpack = compiler.webpack;

    const initialOutputPublicPathSetting: typeof compiler.options.output.publicPath =
      compiler.options.output.publicPath;

    compiler.hooks.thisCompilation.tap(this._pluginName, (compilation: webpack.Compilation) => {
      if (initialOutputPublicPathSetting) {
        compilation.warnings.push(
          new compiler.webpack.WebpackError(
            `The "output.publicPath" option is set in the Webpack configuration. The ${this.constructor.name} ` +
              'plugin may produce unexpected results. It is recommended that the "output.publicPath" configuration option ' +
              'be unset when using this plugin.'
          )
        );
      } else {
        compilation.hooks.runtimeRequirementInTree.for(thisWebpack.RuntimeGlobals.publicPath).intercept({
          name: this._pluginName,
          register: (tap) => {
            if (tap.name === 'RuntimePlugin') {
              // Disable the default public path runtime plugin
              return {
                ...tap,
                fn: () => {
                  /* noop */
                }
              };
            } else {
              return tap;
            }
          }
        });
      }

      this._applyCompilation(thisWebpack, compilation);
    });
  }

  protected abstract _applyCompilation(thisWebpack: typeof webpack, compilation: webpack.Compilation): void;
}
