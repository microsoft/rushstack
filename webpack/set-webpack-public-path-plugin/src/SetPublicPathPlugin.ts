// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { EOL } from 'os';
import { VersionDetection } from '@rushstack/webpack-plugin-utilities';
import { Text, PackageJsonLookup, IPackageJson } from '@rushstack/node-core-library';

import type * as Webpack from 'webpack';
import type * as Tapable from 'tapable';
// Workaround for https://github.com/pnpm/pnpm/issues/4301
import type * as Webpack5 from '@rushstack/heft-webpack5-plugin/node_modules/webpack';

import { IInternalOptions, getSetPublicPathCode } from './codeGenerator';

/**
 * The base options for setting the webpack public path at runtime.
 *
 * @public
 */
export interface ISetWebpackPublicPathOptions {
  /**
   * Use the System.baseURL property if it is defined.
   */
  systemJs?: boolean;

  /**
   * Use the specified string as a URL prefix after the SystemJS path or the publicPath option.
   * If neither systemJs nor publicPath is defined, this option will not apply and an exception will be thrown.
   */
  urlPrefix?: string;

  /**
   * Use the specified path as the base public path.
   */
  publicPath?: string;

  /**
   * Check for a variable with this name on the page and use its value as a regular expression against script paths to
   *  the bundle's script. If a value foo is passed into regexVariable, the produced bundle will look for a variable
   *  called foo during initialization, and if a foo variable is found, use its value as a regular expression to detect
   *  the bundle's script.
   *
   * See the README for more information.
   */
  regexVariable?: string;

  /**
   * A function that returns a snippet of code that manipulates the variable with the name that's specified in the
   *  parameter. If this parameter isn't provided, no post-processing code is included. The variable must be modified
   *  in-place - the processed value should not be returned.
   *
   * See the README for more information.
   */
  getPostProcessScript?: (varName: string) => string;

  /**
   * If true, find the last script matching the regexVariable (if it is set). If false, find the first matching script.
   * This can be useful if there are multiple scripts loaded in the DOM that match the regexVariable.
   */
  preferLastFoundScript?: boolean;

  /**
   * If true, always include the public path-setting code. Don't try to detect if any chunks or assets are present.
   */
  skipDetection?: boolean;
}

/**
 * Options for the set-webpack-public-path plugin.
 *
 * @public
 */
export interface ISetWebpackPublicPathPluginOptions extends ISetWebpackPublicPathOptions {
  /**
   * An object that describes how the public path should be discovered.
   */
  scriptName?: {
    /**
     * If set to true, use the webpack generated asset's name. This option is not compatible with
     * andy other scriptName options.
     */
    useAssetName?: boolean;

    /**
     * A regular expression expressed as a string to be applied to all script paths on the page.
     */
    name?: string;

    /**
     * If true, the name property is tokenized.
     *
     * See the README for more information.
     */
    isTokenized?: boolean;
  };
}

interface IAsset {
  size(): number;
  source(): string;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
declare const __dummyWebpack4MainTemplate: Webpack.compilation.MainTemplate;
interface IWebpack4ExtendedMainTemplate extends Webpack.compilation.MainTemplate {
  hooks: {
    startup: Tapable.SyncHook<string, Webpack.compilation.Chunk, string>;
  } & typeof __dummyWebpack4MainTemplate.hooks;
}

const SHOULD_REPLACE_ASSET_NAME_TOKEN: unique symbol = Symbol(
  'set-public-path-plugin-should-replace-asset-name'
);

interface IExtendedChunk extends Webpack.compilation.Chunk {
  [SHOULD_REPLACE_ASSET_NAME_TOKEN]: boolean;
}

interface IStartupCodeOptions {
  source: string;
  chunk: IExtendedChunk;
  hash: string;
  requireFn: string;
}

const PLUGIN_NAME: string = 'set-webpack-public-path';

const ASSET_NAME_TOKEN: string = '-ASSET-NAME-c0ef4f86-b570-44d3-b210-4428c5b7825c';

const ASSET_NAME_TOKEN_REGEX: RegExp = new RegExp(ASSET_NAME_TOKEN);

/**
 * This simple plugin sets the __webpack_public_path__ variable to a value specified in the arguments,
 *  optionally appended to the SystemJs baseURL property.
 *
 * @public
 */
export class SetPublicPathPlugin implements Webpack.Plugin {
  public options: ISetWebpackPublicPathPluginOptions;

  public constructor(options: ISetWebpackPublicPathPluginOptions) {
    this.options = options;

    if (options.scriptName) {
      if (options.scriptName.useAssetName && options.scriptName.name) {
        throw new Error('scriptName.userAssetName and scriptName.name must not be used together');
      } else if (options.scriptName.isTokenized && !options.scriptName.name) {
        throw new Error('scriptName.isTokenized is only valid if scriptName.name is set');
      }
    }
  }

  public apply(compiler: Webpack.Compiler): void {
    // Casting here because VersionDetection refers to webpack 5 typings
    if (VersionDetection.isWebpack3OrEarlier(compiler as unknown as Webpack5.Compiler)) {
      throw new Error(`The ${SetPublicPathPlugin.name} plugin requires Webpack 4`);
    }

    // Casting here because VersionDetection refers to webpack 5 typings
    const isWebpack4: boolean = VersionDetection.isWebpack4(compiler as unknown as Webpack5.Compiler);

    compiler.hooks.compilation.tap(
      PLUGIN_NAME,
      (compilation: Webpack.compilation.Compilation | Webpack5.Compilation) => {
        if (isWebpack4) {
          const webpack4Compilation: Webpack.compilation.Compilation =
            compilation as Webpack.compilation.Compilation;
          const mainTemplate: IWebpack4ExtendedMainTemplate =
            webpack4Compilation.mainTemplate as IWebpack4ExtendedMainTemplate;
          mainTemplate.hooks.startup.tap(
            PLUGIN_NAME,
            (source: string, chunk: Webpack.compilation.Chunk, hash: string) => {
              const extendedChunk: IExtendedChunk = chunk as IExtendedChunk;
              const assetOrChunkFound: boolean =
                !!this.options.skipDetection || this._detectAssetsOrChunks(extendedChunk);
              if (assetOrChunkFound) {
                return this._getStartupCode({
                  source,
                  chunk: extendedChunk,
                  hash,
                  requireFn: mainTemplate.requireFn
                });
              } else {
                return source;
              }
            }
          );
        } else {
          // Webpack 5 has its own automatic public path code, so only apply for Webpack 4
          const Webpack5Error: typeof Webpack5.WebpackError = (compiler as unknown as Webpack5.Compiler)
            .webpack.WebpackError;
          const thisPackageJson: IPackageJson = PackageJsonLookup.loadOwnPackageJson(__dirname);
          compilation.errors.push(
            new Webpack5Error(
              'Webpack 5 supports its own automatic public path detection, ' +
                `so ${thisPackageJson.name} is unnecessary. Remove the ${SetPublicPathPlugin.name} plugin ` +
                'from the Webpack configuration.'
            )
          );
        }
      }
    );

    // Webpack 5 has its own automatic public path code, so only apply for Webpack 4
    if (isWebpack4) {
      compiler.hooks.emit.tap(
        PLUGIN_NAME,
        (compilation: Webpack.compilation.Compilation | Webpack5.Compilation) => {
          for (const chunkGroup of compilation.chunkGroups) {
            for (const chunk of chunkGroup.chunks) {
              if (chunk[SHOULD_REPLACE_ASSET_NAME_TOKEN]) {
                for (const assetFilename of chunk.files) {
                  let escapedAssetFilename: string;
                  if (assetFilename.match(/\.map$/)) {
                    // Trim the ".map" extension
                    escapedAssetFilename = assetFilename.substr(
                      0,
                      assetFilename.length - 4 /* '.map'.length */
                    );
                    escapedAssetFilename = Text.escapeRegExp(escapedAssetFilename);
                    // source in sourcemaps is JSON-encoded
                    escapedAssetFilename = JSON.stringify(escapedAssetFilename);
                    // Trim the quotes from the JSON encoding
                    escapedAssetFilename = escapedAssetFilename.substring(1, escapedAssetFilename.length - 1);
                  } else {
                    escapedAssetFilename = Text.escapeRegExp(assetFilename);
                  }

                  const asset: IAsset = compilation.assets[assetFilename];
                  const originalAssetSource: string = asset.source();
                  const originalAssetSize: number = asset.size();

                  const newAssetSource: string = originalAssetSource.replace(
                    ASSET_NAME_TOKEN_REGEX,
                    escapedAssetFilename
                  );
                  const sizeDifference: number = assetFilename.length - ASSET_NAME_TOKEN.length;
                  asset.source = () => newAssetSource;
                  asset.size = () => originalAssetSize + sizeDifference;
                }
              }
            }
          }
        }
      );
    }
  }

  private _detectAssetsOrChunks(chunk: IExtendedChunk): boolean {
    for (const chunkGroup of chunk.groupsIterable) {
      if (chunkGroup.childrenIterable.size > 0) {
        return true;
      }
    }

    for (const innerModule of chunk.modulesIterable) {
      if (innerModule.buildInfo.assets && Object.keys(innerModule.buildInfo.assets).length > 0) {
        return true;
      }
    }

    return false;
  }

  private _getStartupCode(options: IStartupCodeOptions): string {
    const moduleOptions: IInternalOptions = { ...this.options };

    // If this module has ownership over any chunks or assets, inject the public path code
    moduleOptions.webpackPublicPathVariable = `${options.requireFn}.p`;
    moduleOptions.linePrefix = '  ';

    if (this.options.scriptName) {
      if (this.options.scriptName.name) {
        moduleOptions.regexName = this.options.scriptName.name;
        if (this.options.scriptName.isTokenized) {
          moduleOptions.regexName = moduleOptions.regexName
            .replace(/\[name\]/g, Text.escapeRegExp(options.chunk.name))
            .replace(/\[hash\]/g, options.chunk.renderedHash || '');
        }
      } else if (this.options.scriptName.useAssetName) {
        options.chunk[SHOULD_REPLACE_ASSET_NAME_TOKEN] = true;

        moduleOptions.regexName = ASSET_NAME_TOKEN;
      }
    }

    return [
      '// Set the webpack public path',
      '(function () {',
      getSetPublicPathCode(moduleOptions, console.error),
      '})();',
      '',
      options.source
    ].join(EOL);
  }
}
