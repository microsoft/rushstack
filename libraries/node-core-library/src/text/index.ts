// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Operations for working with strings that contain text.
 *
 * @remarks
 * The utilities provided by this class are intended to be simple, small, and very
 * broadly applicable.
 *
 * @module
 * @public
 */

export { replaceAll } from './replaceAll';
export { convertToCrLf } from './convertToCrLf';
export { convertToLf } from './convertToLf';
export { convertTo } from './convertTo';
export { NewlineKind, getNewline } from './getNewline';
export { padEnd } from './padEnd';
export { padStart } from './padStart';
export { truncateWithEllipsis } from './truncateWithEllipsis';
export { ensureTrailingNewline } from './ensureTrailingNewline';
export { escapeRegExp } from './escapeRegExp';
export {
  Encoding,
  type IReadLinesFromIterableOptions,
  readLinesFromIterableAsync,
  readLinesFromIterable
} from './readLinesFromIterable';
export { reverse } from './reverse';
export { splitByNewLines } from './splitByNewLines';
