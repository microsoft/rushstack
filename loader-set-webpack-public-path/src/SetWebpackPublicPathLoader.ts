/*
 * Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See LICENSE in the project root for license information.
 */

import { merge } from 'lodash';
const loaderUtils = require('loader-utils'); // tslint:disable-line:typedef

import {
  IInternalOptions,
  getSetPublicPathCode,
  getGlobalRegisterCode
} from './codeGenerator';

export interface ISetWebpackPublicPathLoaderOptions extends ISetWebpackPublicPathOptions {
  scriptName?: string;
}

export interface ISetWebpackPublicPathOptions {
  systemJs?: boolean;
  urlPrefix?: string;
  publicPath?: string;
}

export class SetWebpackPublicPathLoader {
  public static registryVarName: string = 'window.__setWebpackPublicPathLoaderSrcRegistry__';

  private static staticOptions: ISetWebpackPublicPathLoaderOptions = {
    systemJs: false,
    scriptName: undefined,
    urlPrefix: undefined,
    publicPath: undefined
  };

  public static getGlobalRegisterCode(debug: boolean = false): string {
    return getGlobalRegisterCode(debug);
  }

  public static setOptions(options: ISetWebpackPublicPathLoaderOptions): void {
    this.staticOptions = options || {};
  }

  public static pitch(remainingRequest: string): string {
    /* tslint:disable:no-any */
    const self: any = this;
    /* tslint:enable:no-any */

    const options: IInternalOptions = SetWebpackPublicPathLoader.getOptions(self.query);
    return getSetPublicPathCode(options, self.emitWarning);
  }

  private static getOptions(query: string): IInternalOptions {
    const queryOptions: ISetWebpackPublicPathLoaderOptions = loaderUtils.parseQuery(query);

    const options: ISetWebpackPublicPathLoaderOptions & IInternalOptions =
      merge(merge({}, SetWebpackPublicPathLoader.staticOptions), queryOptions);

    if (options.systemJs || options.publicPath) {
      // If ?systemJs or ?publicPath=... is set inline, override regexName
      options.regexName = undefined;
    } else {
      options.regexName = options.scriptName;
    }

    if (!options.webpackPublicPathVariable) {
      options.webpackPublicPathVariable = '__webpack_public_path__';
    }

    return options;
  }

  constructor() {
    throw new Error('Constructing "LoadThemedStylesLoader" is not supported.');
  }
}
