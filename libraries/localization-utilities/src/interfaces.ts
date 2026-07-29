// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ISourcePosition } from '@rushstack/typings-generator';

/**
 * Options for the pseudolocale library.
 *
 * @internalRemarks
 * Eventually this should be replaced with DefinitelyTyped types.
 *
 * @public
 */
export interface IPseudolocaleOptions {
  prepend?: string;
  append?: string;
  delimiter?: string;
  startDelimiter?: string;
  endDelimiter?: string;
  extend?: number;
  override?: string;
}

/**
 * @public
 */
export interface ILocalizationFile {
  [stringName: string]: ILocalizedString;
}

/**
 * @public
 */
export interface ILocalizedString {
  value: string;
  comment?: string;

  /**
   * The zero-based position of this string's declaration in the source file, when the parser is
   * able to determine it. This is used to emit declaration source maps so that editors can
   * navigate from generated typings back to the string declaration.
   */
  sourcePosition?: ISourcePosition;
}

/**
 * @public
 */
export interface IParseFileOptions {
  content: string;
  filePath: string;
  /**
   * Optionally, provide a function that will be called for each string. If the function returns `true`
   * the string will not be included.
   */
  ignoreString?: IgnoreStringFunction;
}

/**
 * @public
 */
export type IgnoreStringFunction = (filePath: string, stringName: string) => boolean;
