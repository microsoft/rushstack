// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, ITerminal, NewlineKind } from '@rushstack/node-core-library';

import type { IgnoreStringFunction, ILocalizationFile } from './interfaces';
import { parseResx } from './parsers/parseResx';

/**
 * @deprecated
 *
 * This has superseded by {@link IParseResxOptions}
 *
 * @public
 */
export interface IResxReaderOptions {
  resxFilePath: string;
  terminal: ITerminal;
  newlineNormalization: NewlineKind | undefined;
  warnOnMissingComment: boolean;
  /**
   * Optionally, provide a function that will be called for each string. If the function returns `true`
   * the string will not be included.
   */
  ignoreString?: IgnoreStringFunction;
}

/**
 * @deprecated
 *
 * Use {@link parseResx} instead.
 *
 * @public
 */
export function readResxFileAsLocFile(options: IResxReaderOptions): ILocalizationFile {
  const content: string = FileSystem.readFile(options.resxFilePath);
  return parseResx({
    ...options,
    content,
    filePath: options.resxFilePath,
    resxNewlineNormalization: options.newlineNormalization,
    ignoreMissingResxComments: !options.warnOnMissingComment
  });
}

/**
 * @deprecated
 *
 * Use {@link parseResx} instead.
 *
 * @public
 */
export function readResxAsLocFile(resxContents: string, options: IResxReaderOptions): ILocalizationFile {
  return parseResx({
    ...options,
    content: resxContents,
    filePath: options.resxFilePath,
    resxNewlineNormalization: options.newlineNormalization,
    ignoreMissingResxComments: !options.warnOnMissingComment
  });
}
