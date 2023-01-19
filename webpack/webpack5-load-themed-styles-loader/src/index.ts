// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This simple loader wraps the loading of CSS in script equivalent to
 *  require("\@microsoft/load-themed-styles").loadStyles('... css text ...').
 * @packageDocumentation
 */

import type { LoaderContext, PitchLoaderDefinitionFunction } from 'webpack';

const defaultThemedStylesPath: string = require.resolve('@microsoft/load-themed-styles');

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
  loadThemedStylesPath?: string;
  esModule?: boolean;
}

/**
 * This simple loader wraps the loading of CSS in script equivalent to
 *  require("load-themed-styles").loadStyles('... css text ...').
 *
 * @public
 */

export const pitch: PitchLoaderDefinitionFunction<ILoadThemedStylesLoaderOptions> = function (
  this: LoaderContext<ILoadThemedStylesLoaderOptions>,
  remainingRequest: string
): string {
  const loaderContext: LoaderContext<ILoadThemedStylesLoaderOptions> = this;
  const options: ILoadThemedStylesLoaderOptions = loaderContext.getOptions() || {};
  if ((options as Record<string, unknown>).namedExport) {
    throw new Error('The "namedExport" option has been removed.');
  }

  const { async = false, loadThemedStylesPath = defaultThemedStylesPath, esModule = false } = options;
  const stringifiedRequest: string = JSON.stringify(
    loaderContext.utils.contextify(loaderContext.context, '!!' + remainingRequest)
  );

  const importCode: [contentImport: string, loaderImport: string] = esModule
    ? [
        `import content from ${stringifiedRequest};`,
        `import { loadStyles } from ${JSON.stringify(loadThemedStylesPath)};`
      ]
    : [
        `var content = require(${stringifiedRequest});`,
        `var loader = require(${JSON.stringify(loadThemedStylesPath)});`
      ];

  return [
    ...importCode,
    '',
    'if(typeof content === "string") content = [[module.id, content]];',
    '',
    '// add the styles to the DOM',
    `for (var i = 0; i < content.length; i++) ${
      esModule ? 'loadStyles' : 'loader.loadStyles'
    }(content[i][1], ${async === true});`,
    '',
    'if(content.locals) module.exports = content.locals;'
  ].join('\n');
};
