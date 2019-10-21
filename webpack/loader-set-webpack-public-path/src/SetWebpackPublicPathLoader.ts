// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { merge } from 'lodash';
const loaderUtils = require('loader-utils'); // eslint-disable-line

import {
  IInternalOptions,
  getSetPublicPathCode,
  getGlobalRegisterCode
} from '@microsoft/set-webpack-public-path-plugin/lib/codeGenerator';

import { ISetWebpackPublicPathOptions } from '@microsoft/set-webpack-public-path-plugin';

export interface ISetWebpackPublicPathLoaderOptions extends ISetWebpackPublicPathOptions {
  scriptName?: string;
}

export class SetWebpackPublicPathLoader {
  private static _staticOptions: ISetWebpackPublicPathLoaderOptions = {
    systemJs: false,
    scriptName: undefined,
    urlPrefix: undefined,
    publicPath: undefined
  };

  public constructor() {
    throw new Error('Constructing "LoadThemedStylesLoader" is not supported.');
  }

  public static getGlobalRegisterCode(debug: boolean = false): string {
    return getGlobalRegisterCode(debug);
  }

  public static setOptions(options: ISetWebpackPublicPathLoaderOptions): void {
    this._staticOptions = options || {};
  }

  public static pitch(remainingRequest: string): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const self: any = this;


    const options: IInternalOptions = SetWebpackPublicPathLoader._getOptions(self);
    return getSetPublicPathCode(options, self.emitWarning);
  }

  private static _getOptions(context: any): IInternalOptions { // eslint-disable-line @typescript-eslint/no-explicit-any
    const queryOptions: ISetWebpackPublicPathLoaderOptions = loaderUtils.getOptions(context);

    const options: ISetWebpackPublicPathLoaderOptions & IInternalOptions =
      merge(merge({}, SetWebpackPublicPathLoader._staticOptions), queryOptions);

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
}
