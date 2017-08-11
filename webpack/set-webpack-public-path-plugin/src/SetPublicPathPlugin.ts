/*
 * Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See LICENSE in the project root for license information.
 */

import { EOL } from 'os';
import {
  cloneDeep,
  escapeRegExp
} from 'lodash';
import {
  Plugin,
  Webpack
} from 'webpack';
import * as ITapable from 'tapable';

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
     * A regular expression expressed as a string to be applied to all script paths on the page.
     */
    name: string;

    /**
     * If true, the name property is tokenized.
     *
     * See the README for more information.
     */
    isTokenized: boolean;
  };
}

import {
  IInternalOptions,
  getSetPublicPathCode
} from './codeGenerator';

interface IAsset {
}

interface IChunk {
  modules: IModule[];
  chunks: IChunk[];
  name: string;
  renderedHash: string;
}

interface IModule {
  assets: IAsset[];
}

interface IMainTemplate extends ITapable {
  requireFn: string;
}

interface ICompilation {
  mainTemplate: IMainTemplate;
}

/**
 * This simple plugin sets the __webpack_public_path__ variable to a value specified in the arguments,
 *  optionally appended to the SystemJs baseURL property.
 *
 * @public
 */
export class SetPublicPathPlugin implements Plugin {
  public options: ISetWebpackPublicPathPluginOptions;

  constructor(options: ISetWebpackPublicPathPluginOptions) {
    this.options = options;
  }

  // This type should be "compiler," but there's another type mismatch issue so we have to stay on
  //  @types/webpack@2.2.4 for now.
  public apply(compiler: Webpack & ITapable): void {
    const self: SetPublicPathPlugin = this;
    compiler.plugin('compilation', (compilation: ICompilation, params: Object): void => {
      compilation.mainTemplate.plugin('startup', (source: string, chunk: IChunk, hash: string) => {
        let assetOrChunkFound: boolean = chunk.chunks.length > 0;
        if (!assetOrChunkFound) {
          for (const innerModule of chunk.modules) {
            if (innerModule.assets && Object.keys(innerModule.assets).length > 0) {
              assetOrChunkFound = true;
              break;
            }
          }
        }

        if (assetOrChunkFound) {
          const moduleOptions: IInternalOptions = cloneDeep(this.options);

          // If this module has ownership over any chunks or assets, inject the public path code
          moduleOptions.webpackPublicPathVariable = `${compilation.mainTemplate.requireFn}.p`;
          moduleOptions.linePrefix = '  ';

          if (this.options.scriptName) {
            moduleOptions.regexName = this.options.scriptName.name;
            if (this.options.scriptName.isTokenized) {
              moduleOptions.regexName = moduleOptions.regexName.replace(/\[name\]/g, escapeRegExp(chunk.name))
                                                               .replace(/\[hash\]/g, chunk.renderedHash);
            }
          }

          return [
            '// Set the webpack public path',
            '(function () {',
              getSetPublicPathCode(moduleOptions, console.error),
            '})();',
            '',
            source
          ].join(EOL);
        } else {
          return source;
        }
      });
    });
  }
}
