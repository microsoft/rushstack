/*
 * Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See LICENSE in the project root for license information.
 */

import { EOL } from 'os';
import {
  Plugin,
  Compiler,
  compiler
} from 'webpack';
import * as ITapable from 'tapable';

import { ISetWebpackPublicPathLoaderOptions } from './SetWebpackPublicPathLoader';

import {
  IInternalOptions,
  getSetPublicPathCode
} from './codeGenerator';

interface IAsset {
}

interface IChunk {
}

interface IModule {
  modules: IModule[];
  assets: IAsset[];
  chunks: IChunk[];
}

interface IMainTemplate extends ITapable {
  requireFn: string;
}

interface ICompilation {
  mainTemplate: IMainTemplate;
}

export default class SetPublicPathPlugin implements Plugin {
  private _options: IInternalOptions;

  constructor(options: ISetWebpackPublicPathLoaderOptions) {
    this._options = options as IInternalOptions;
  }

  public apply(compiler: Compiler): void {
    const self: SetPublicPathPlugin = this;
    compiler.plugin('compilation', (compilation: ICompilation, params: Object): void => {
      compilation.mainTemplate.plugin('startup', (source: string, module: IModule, hash: string) => {
        let assetOrChunkFound: boolean = module.chunks.length > 0;
        if (!assetOrChunkFound) {
          for (const innerModule of module.modules) {
            if (innerModule.assets && Object.keys(innerModule.assets).length > 0) {
              assetOrChunkFound = true;
              break;
            }
          }
        }

        if (assetOrChunkFound) {
          // If this module has ownership over any chunks or assets, inject the public path code
          self._options.webpackPublicPathVariable = `${compilation.mainTemplate.requireFn}.p`;
          self._options.linePrefix = '  ';

          return [
            '// Set the webpack public path',
            '(function () {',
              getSetPublicPathCode(self._options, console.error),
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
