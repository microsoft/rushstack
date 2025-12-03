// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type webpack from 'webpack';

import { Text } from '@rushstack/node-core-library';

import { type IInternalOptions, getSetPublicPathCode } from './codeGenerator';
import { SetPublicPathPluginBase } from './SetPublicPathPluginBase';

/**
 * The base options for setting the webpack public path at runtime.
 *
 * @public
 */
export interface ISetWebpackPublicPathOptions {
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
}

/**
 * @public
 */
export interface IScriptNameAssetNameOptions {
  /**
   * If set to true, use the webpack generated asset's name. This option is not compatible with
   * andy other scriptName options.
   */
  useAssetName: true;
}

/**
 * @public
 */
export interface IScriptNameRegexOptions {
  /**
   * A regular expression expressed as a string to be applied to all script paths on the page.
   */
  name: string;

  /**
   * If true, the name property is tokenized.
   *
   * See the README for more information.
   */
  isTokenized?: boolean;
}

/**
 * @public
 */
export type IScriptNameOptions = IScriptNameAssetNameOptions | IScriptNameRegexOptions;

type IScriptNameInternalOptions =
  | (IScriptNameAssetNameOptions & { [key in keyof IScriptNameRegexOptions]?: never })
  | (IScriptNameRegexOptions & { [key in keyof IScriptNameAssetNameOptions]?: never });

/**
 * Options for the set-webpack-public-path plugin.
 *
 * @public
 */
export interface ISetWebpackPublicPathPluginOptions extends ISetWebpackPublicPathOptions {
  /**
   * An object that describes how the public path should be discovered.
   */
  scriptName: IScriptNameOptions;
}

const SHOULD_REPLACE_ASSET_NAME_TOKEN: unique symbol = Symbol(
  'set-public-path-plugin-should-replace-asset-name'
);

interface IExtendedChunk extends webpack.Chunk {
  [SHOULD_REPLACE_ASSET_NAME_TOKEN]?: boolean;
}

const PLUGIN_NAME: string = 'set-webpack-public-path';

const ASSET_NAME_TOKEN: string = '-ASSET-NAME-c0ef4f86-b570-44d3-b210-4428c5b7825c';

/**
 * This simple plugin sets the __webpack_public_path__ variable to a value specified in the arguments.
 *
 * @public
 */
export class SetPublicPathPlugin extends SetPublicPathPluginBase {
  public readonly options: ISetWebpackPublicPathPluginOptions;

  public constructor(options: ISetWebpackPublicPathPluginOptions) {
    super(PLUGIN_NAME);
    this.options = options;

    const scriptNameOptions: IScriptNameInternalOptions = options.scriptName;
    if (scriptNameOptions.useAssetName && scriptNameOptions.name) {
      throw new Error('scriptName.userAssetName and scriptName.name must not be used together');
    } else if (scriptNameOptions.isTokenized && !scriptNameOptions.name) {
      throw new Error('scriptName.isTokenized is only valid if scriptName.name is set');
    }
  }

  protected _applyCompilation(thisWebpack: typeof webpack, compilation: webpack.Compilation): void {
    class SetPublicPathRuntimeModule extends thisWebpack.RuntimeModule {
      private readonly _pluginOptions: ISetWebpackPublicPathPluginOptions;

      public constructor(pluginOptions: ISetWebpackPublicPathPluginOptions) {
        super('publicPath', thisWebpack.RuntimeModule.STAGE_BASIC);
        this._pluginOptions = pluginOptions;
      }

      public generate(): string {
        const {
          name: regexpName,
          isTokenized: regexpIsTokenized,
          useAssetName
        } = this._pluginOptions.scriptName as IScriptNameInternalOptions;

        const { chunk } = this;
        if (!chunk) {
          throw new Error(`Chunk is not defined`);
        }

        let regexName: string;
        if (regexpName) {
          regexName = regexpName;
          if (regexpIsTokenized) {
            regexName = regexName
              .replace(/\[name\]/g, Text.escapeRegExp(`${chunk.name}`))
              .replace(/\[hash\]/g, chunk.renderedHash || '');
          }
        } else if (useAssetName) {
          (chunk as IExtendedChunk)[SHOULD_REPLACE_ASSET_NAME_TOKEN] = true;

          regexName = ASSET_NAME_TOKEN;
        } else {
          throw new Error('scriptName.name or scriptName.useAssetName must be set');
        }

        const moduleOptions: IInternalOptions = {
          webpackPublicPathVariable: thisWebpack.RuntimeGlobals.publicPath,
          regexName,
          ...this._pluginOptions
        };

        return getSetPublicPathCode(moduleOptions);
      }
    }

    compilation.hooks.runtimeRequirementInTree
      .for(thisWebpack.RuntimeGlobals.publicPath)
      .tap(PLUGIN_NAME, (chunk: webpack.Chunk, set: Set<string>) => {
        compilation.addRuntimeModule(chunk, new SetPublicPathRuntimeModule(this.options));
      });

    compilation.hooks.processAssets.tap(PLUGIN_NAME, (assets) => {
      for (const chunkGroup of compilation.chunkGroups) {
        for (const chunk of chunkGroup.chunks) {
          if ((chunk as IExtendedChunk)[SHOULD_REPLACE_ASSET_NAME_TOKEN]) {
            for (const assetFilename of chunk.files) {
              let escapedAssetFilename: string;
              if (assetFilename.match(/\.map$/)) {
                // Trim the ".map" extension
                escapedAssetFilename = assetFilename.slice(0, -4 /* '.map'.length */);
                escapedAssetFilename = Text.escapeRegExp(escapedAssetFilename);
                // source in sourcemaps is JSON-encoded
                escapedAssetFilename = JSON.stringify(escapedAssetFilename);
                // Trim the quotes from the JSON encoding
                escapedAssetFilename = escapedAssetFilename.slice(1, -1);
              } else {
                escapedAssetFilename = Text.escapeRegExp(assetFilename);
              }

              const asset: webpack.sources.Source = assets[assetFilename];

              const newAsset: webpack.sources.ReplaceSource = new thisWebpack.sources.ReplaceSource(asset);
              const sourceString: string = asset.source().toString();
              for (
                let index: number = sourceString.lastIndexOf(ASSET_NAME_TOKEN);
                index >= 0;
                index = sourceString.lastIndexOf(ASSET_NAME_TOKEN, index - 1)
              ) {
                newAsset.replace(index, index + ASSET_NAME_TOKEN.length - 1, escapedAssetFilename);
              }

              assets[assetFilename] = newAsset;
            }
          }
        }
      }
    });
  }
}
