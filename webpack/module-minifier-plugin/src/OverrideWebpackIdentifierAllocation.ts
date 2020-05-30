// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Template } from 'webpack';
import { DEFAULT_DIGIT_SORT } from './Constants';

// Set of ECMAScript reserved keywords (past and present): https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar
const RESERVED_KEYWORDS: Set<string> = new Set([
  'abstract',
  'arguments',
  'boolean',
  'break',
  'byte',
  'case',
  'catch',
  'char',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'double',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'final',
  'finally',
  'float',
  'for',
  'function',
  'get',
  'goto',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'int',
  'interface',
  'let',
  'long',
  'native',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'set',
  'short',
  'static',
  'super',
  'switch',
  'synchronized',
  'this',
  'throw',
  'throws',
  'transient',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'volatile',
  'while',
  'with',
  'yield',
]);

/**
 * Gets a base54 string suitable for use as a JavaScript identifier, not accounting for reserved keywords
 * This function is borrowed from Terser, in turn from Uglify-js
 *
 * @param ordinal The number to convert to a base54 identifier
 */
function getIdentifierInternal(ordinal: number): string {
  let ret: string = '';
  let base: 54 | 64 = 54;

  ++ordinal;
  do {
    --ordinal;
    ret += DEFAULT_DIGIT_SORT[ordinal % base];
    ordinal = (ordinal / base) | 0; // eslint-disable-line no-bitwise
    base = 64;
  } while (ordinal > 0);

  return ret;
}

/**
 * getIdentifier(n) would otherwise return each of these specified ECMAScript reserved keywords, which are not legal identifiers.
 */
const RESERVED_ORDINALS: number[] = [];
for (let i: number = 0; i < 100000; i++) {
  // TODO: Consider replacing this with an identifierToNumberInternal(identifier) function
  const identifier: string = getIdentifierInternal(i);
  if (RESERVED_KEYWORDS.has(identifier)) {
    RESERVED_ORDINALS.push(i);
  }
}

/**
 * Gets a base54 string suitable for use as a JavaScript identifier, omitting those that are valid ECMAScript keywords
 * Not guaranteed not to collide if `ordinal` >= 100000
 *
 * @param ordinal The number to convert to a base54 identifier
 */
function getIdentifier(ordinal: number): string {
  // Need to skip over reserved keywords
  for (let i: number = 0, len: number = RESERVED_ORDINALS.length; i < len && ordinal >= RESERVED_ORDINALS[i]; i++) {
    ++ordinal;
  }

  return getIdentifierInternal(ordinal);
}

// Configure webpack to use the same identifier allocation logic as Terser to maximize gzip compressibility
Template.numberToIdentifer = getIdentifier;