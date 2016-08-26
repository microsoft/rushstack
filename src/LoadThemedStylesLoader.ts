/*
 * Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See LICENSE in the project root for license information.
 */

/* tslint:disable:typedef */
const loaderUtils = require('loader-utils');
/* tslint:enable:typedef */

const loadedThemedStylesPath: string = require.resolve('@microsoft/load-themed-styles');

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
    return [
      `var content = require(${loaderUtils.stringifyRequest(this, '!!' + remainingRequest)});`,
      `var loader = require(${JSON.stringify(LoadThemedStylesLoader._loadedThemedStylesPath)});`,
      '',
      'if(typeof content === "string") content = [[module.id, content]];',
      '',
      '// add the styles to the DOM',
      'for (var i = 0; i < content.length; i++) loader.loadStyles(content[i][1]);',
      '',
      'if(content.locals) module.exports = content.locals;'
    ].join('\n');
  }

  constructor() {
    throw new Error('Constructing "LoadThemedStylesLoader" is not supported.');
  }
}
