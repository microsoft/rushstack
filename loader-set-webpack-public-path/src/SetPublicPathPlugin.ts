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
  Compiler,
  compiler
} from 'webpack';
import * as ITapable from 'tapable';

import { ISetWebpackPublicPathOptions } from './SetWebpackPublicPathLoader';

export interface ISetWebpackPublicPathPluginOptions extends ISetWebpackPublicPathOptions {
  scriptName?: {
    name: string;
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

export default class SetPublicPathPlugin implements Plugin {
  private _options: ISetWebpackPublicPathPluginOptions;

  constructor(options: ISetWebpackPublicPathPluginOptions) {
    this._options = options;
  }

  public apply(compiler: Compiler): void {
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
          const moduleOptions: IInternalOptions = cloneDeep(this._options);

          // If this module has ownership over any chunks or assets, inject the public path code
          moduleOptions.webpackPublicPathVariable = `${compilation.mainTemplate.requireFn}.p`;
          moduleOptions.linePrefix = '  ';

          if (this._options.scriptName) {
            moduleOptions.regexName = this._options.scriptName.name;
            if (this._options.scriptName.isTokenized) {
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
