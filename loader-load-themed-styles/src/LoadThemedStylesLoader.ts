/*
 * Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See LICENSE in the project root for license information.
 */

/* tslint:disable:typedef */
const loaderUtils = require('loader-utils');
/* tslint:enable:typedef */

const loadedThemedStylesPath: string = require.resolve('@microsoft/load-themed-styles');

interface ILoadThemedStylesLoaderOptions {
  namedExport?: string;
}
export class LoadThemedStylesLoader {
  private static _loadedThemedStylesPath: string = loadedThemedStylesPath;

  public static set loadedThemedStylesPath(value: string) {
    LoadThemedStylesLoader._loadedThemedStylesPath = value;
  }

  public static get loadedThemedStylesPath(): string {
    return LoadThemedStylesLoader._loadedThemedStylesPath;
  }

  public static resetLoadedThemedStylesPath(): void {
    LoadThemedStylesLoader._loadedThemedStylesPath = loadedThemedStylesPath;
  }

  public static pitch(remainingRequest: string): string {
    const options: ILoadThemedStylesLoaderOptions = loaderUtils.getOptions(this) || {};
    let exportName: string = 'module.exports';

    if (!!options.namedExport) {
      exportName += '.' + options.namedExport;
    }

    return [
      `var content = require(${loaderUtils.stringifyRequest(this, '!!' + remainingRequest)});`,
      `var loader = require(${JSON.stringify(LoadThemedStylesLoader._loadedThemedStylesPath)});`,
      '',
      'if(typeof content === "string") content = [[module.id, content]];',
      '',
      '// add the styles to the DOM',
      'for (var i = 0; i < content.length; i++) loader.loadStyles(content[i][1]);',
      '',
      `if(content.locals) ${exportName} = content.locals;`
    ].join('\n');
  }

  constructor() {
    throw new Error('Constructing "LoadThemedStylesLoader" is not supported.');
  }
}
