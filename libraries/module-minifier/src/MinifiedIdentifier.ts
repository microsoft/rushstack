// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// TODO: Allow dynamic override of these values in the input to the minifier
import { IDENTIFIER_LEADING_DIGITS, IDENTIFIER_TRAILING_DIGITS } from './constants.ts';

// Set of ECMAScript reserved keywords (past and present): https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar
const RESERVED_KEYWORDS: string[] = [
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
  'yield'
];

/**
 * Gets a base54 string suitable for use as a JavaScript identifier, not accounting for reserved keywords
 * @param ordinal - The number to convert to a base54 identifier
 */
export function getIdentifierInternal(ordinal: number): string {
  let ret: string = IDENTIFIER_LEADING_DIGITS[ordinal % 54];

  // eslint-disable-next-line no-bitwise
  ordinal = (ordinal / 54) | 0;
  while (ordinal > 0) {
    --ordinal;
    // eslint-disable-next-line no-bitwise
    ret += IDENTIFIER_TRAILING_DIGITS[ordinal & 0x3f];
    ordinal >>>= 6;
  }

  return ret;
}

const leadingCharIndex: Map<number, number> = new Map();
for (let i: number = 0; i < 64; i++) {
  leadingCharIndex.set(IDENTIFIER_LEADING_DIGITS.charCodeAt(i), i);
}

const trailingCharIndex: Map<number, number> = new Map();
for (let i: number = 0; i < 64; i++) {
  trailingCharIndex.set(IDENTIFIER_TRAILING_DIGITS.charCodeAt(i), i);
}

/**
 * Converts an identifier into the ordinal that would produce it, not accounting for reserved keywords
 * Returns NaN if the result would exceed 31 bits
 * @param identifier - The identifier to convert to a numeric value
 */
export function getOrdinalFromIdentifierInternal(identifier: string): number {
  let ordinal: number = 0;

  for (let i: number = identifier.length - 1; i > 0; i--) {
    if (ordinal >= 0x2000000) {
      return NaN;
    }

    ordinal <<= 6;
    ordinal += trailingCharIndex.get(identifier.charCodeAt(i))! + 1;
  }

  if (ordinal >= 0x2000000) {
    return NaN;
  }

  ordinal *= 54;
  ordinal += leadingCharIndex.get(identifier.charCodeAt(0))!;
  return ordinal;
}

/**
 * getIdentifier(n) would otherwise return each of these specified ECMAScript reserved keywords, which are not legal identifiers.
 */
const RESERVED_ORDINALS: number[] = ((): number[] => {
  const reserved: number[] = [];
  for (const keyword of RESERVED_KEYWORDS) {
    const ordinal: number = getOrdinalFromIdentifierInternal(keyword);
    if (!isNaN(ordinal)) {
      reserved.push(ordinal);
    }
  }
  return reserved.sort((x: number, y: number) => x - y);
})();

/**
 * Gets a base54 string suitable for use as a JavaScript identifier, omitting those that are valid ECMAScript keywords
 *
 * @param ordinal - The number to convert to a base54 identifier
 *
 * @public
 */
export function getIdentifier(ordinal: number): string {
  // Need to skip over reserved keywords
  for (
    let i: number = 0, len: number = RESERVED_ORDINALS.length;
    i < len && ordinal >= RESERVED_ORDINALS[i];
    i++
  ) {
    ++ordinal;
  }

  return getIdentifierInternal(ordinal);
}
