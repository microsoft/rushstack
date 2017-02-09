/*
 * Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See LICENSE in the project root for license information.
 */

/* tslint:disable:typedef */
const loaderUtils = require('loader-utils');
/* tslint:enable:typedef */

import {
  IInternalOptions,
  getSetPublicPathCode,
  getGlobalRegisterCode
} from './codeGenerator';

export interface ISetWebpackPublicPathLoaderOptions {
  systemJs?: boolean;
  scriptPath?: string;
  urlPrefix?: string;
  publicPath?: string;
}

export class SetWebpackPublicPathLoader {
  public static registryVarName: string = 'window.__setWebpackPublicPathLoaderSrcRegistry__';

  public static getGlobalRegisterCode(debug: boolean = false): string {
    return getGlobalRegisterCode(debug);
  }

  public static pitch(remainingRequest: string): string {
    /* tslint:disable:no-any */
    const self: any = this;
    /* tslint:enable:no-any */

    const options: IInternalOptions = SetWebpackPublicPathLoader.getOptions(self.query);
    return getSetPublicPathCode(options, self.emitWarning);
  }

  private static getOptions(query: string): IInternalOptions {
    const options: IInternalOptions = loaderUtils.parseQuery(query);
    if (options.systemJs || options.publicPath) {
      // If ?systemJs or ?publicPath=... is set inline, override scriptPath
      options.scriptPath = undefined;
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
