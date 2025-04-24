// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This simple loader wraps the loading of CSS in script equivalent to
 *  require("load-themed-styles").loadStyles('... css text ...').
 * @packageDocumentation
 */

import type { loader } from 'webpack';
import loaderUtils from 'loader-utils';

const loadedThemedStylesPath: string = require.resolve('@microsoft/load-themed-styles');

/**
 * Options for the loader.
 *
 * @public
 */
export interface ILoadThemedStylesLoaderOptions {
  /**
   * If this parameter is set to "true," the "loadAsync" parameter is set to true in the call to loadStyles.
   * Defaults to false.
   */
  async?: boolean;
}

/**
 * This simple loader wraps the loading of CSS in script equivalent to
 *  require("load-themed-styles").loadStyles('... css text ...').
 *
 * @public
 */
export class LoadThemedStylesLoader {
  private static _loadedThemedStylesPath: string = loadedThemedStylesPath;

  public constructor() {
    throw new Error('Constructing "LoadThemedStylesLoader" is not supported.');
  }

  public static set loadedThemedStylesPath(value: string) {
    LoadThemedStylesLoader._loadedThemedStylesPath = value;
  }

  /**
   * Use this property to override the path to the `@microsoft/load-themed-styles` package.
   */
  public static get loadedThemedStylesPath(): string {
    return LoadThemedStylesLoader._loadedThemedStylesPath;
  }

  /**
   * Reset the path to the `@microsoft/load-themed-styles package` to the default.
   */
  public static resetLoadedThemedStylesPath(): void {
    LoadThemedStylesLoader._loadedThemedStylesPath = loadedThemedStylesPath;
  }

  public static pitch(this: loader.LoaderContext, remainingRequest: string): string {
    const options: ILoadThemedStylesLoaderOptions = loaderUtils.getOptions(this) || {};
    if ((options as Record<string, unknown>).namedExport) {
      throw new Error('The "namedExport" option has been removed.');
    }

    const { async = false } = options;

    return [
      `var content = require(${loaderUtils.stringifyRequest(this, '!!' + remainingRequest)});`,
      `var loader = require(${JSON.stringify(LoadThemedStylesLoader._loadedThemedStylesPath)});`,
      '',
      'if(typeof content === "string") content = [[module.id, content]];',
      '',
      '// add the styles to the DOM',
      `for (var i = 0; i < content.length; i++) loader.loadStyles(content[i][1], ${async === true});`,
      '',
      'if(content.locals) module.exports = content.locals;'
    ].join('\n');
  }
}
