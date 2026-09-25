// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A fast parser for the JSON dialect accepted by `JsonFile.parseString()` from `@rushstack/node-core-library`
 * (which uses `jju.parse(text, { mode: 'json5', reserved_keys: 'replace' })`).
 *
 * The fast path supports standard JSON plus `//` and `/* *\/` comments and a single trailing comma after the
 * last array element / object member. Comments are replaced with whitespace, trailing commas are removed, and
 * the result is handed to the native `JSON.parse()`.
 *
 * This is exact for every input that it accepts:
 * - `jju` (with `reserved_keys: 'replace'`) creates properties with `Object.defineProperty()` on a normal object,
 *   which matches `JSON.parse()` for duplicate keys (last value wins, first position kept) and for `__proto__`
 *   (an own data property).
 * - Numbers use the same correctly-rounded conversion.
 *
 * Anything else (single-quoted strings, unquoted keys, hexadecimal numbers, `Infinity`, a BOM, exotic whitespace,
 * U+2028/U+2029, unterminated comments, or any syntax error) returns `undefined`, and the caller must fall back
 * to the real `JsonFile.parseString()`, which produces the canonical result or error message.
 */

// A double-quoted string (group 1), or a comment. JSON5 comments are `//` to the end of the line and non-nested
// `/* */` blocks, outside of strings. Since regular expressions are executed natively, this is much faster than a
// character loop in cold (interpreted) JavaScript.
const STRING_OR_COMMENT_REGEXP: RegExp = /("(?:[^"\\]|\\.)*")|\/\/[^\n\r]*|\/\*[\s\S]*?\*\//g;

// A double-quoted string (group 1), or a comma that follows the end of a value and precedes a closing bracket or
// brace (a JSON5 trailing comma).
const STRING_OR_TRAILING_COMMA_REGEXP: RegExp =
  /("(?:[^"\\]|\\.)*")|(?<=[\]}"0-9a-zA-Z.+\-]\s*),(?=\s*[\]}])/g;

const POSSIBLE_TRAILING_COMMA_REGEXP: RegExp = /,\s*[\]}]/;

// Characters that jju treats differently than JSON.parse(): U+2028/U+2029 are line terminators, U+FEFF is
// whitespace, and a backslash followed by a line terminator is a JSON5 line continuation.
const UNSUPPORTED_SYNTAX_REGEXP: RegExp = /[\u2028\u2029\ufeff]|\\[\r\n]/;

/**
 * Returns the text with comments replaced by whitespace and JSON5-style trailing commas removed, or `undefined` if
 * the text uses syntax that the fast path does not handle.
 *
 * @remarks
 * Removing a comma that follows a value and precedes `]` or `}` can only produce valid JSON if the comma was a
 * trailing comma, which JSON5 permits. Anything else that is not plain JSON (single quotes, unquoted keys, etc.)
 * is left in place, so `JSON.parse()` rejects it.
 */
export function stripJsonCommentsAndTrailingCommas(text: string): string | undefined {
  if (UNSUPPORTED_SYNTAX_REGEXP.test(text)) {
    return undefined;
  }

  let result: string = text;
  if (result.indexOf('/') !== -1) {
    // Keep strings, and replace comments with a space so that adjacent tokens stay separated
    result = result.replace(STRING_OR_COMMENT_REGEXP, '$1 ');
  }

  if (POSSIBLE_TRAILING_COMMA_REGEXP.test(result)) {
    result = result.replace(STRING_OR_TRAILING_COMMA_REGEXP, '$1');
  }

  return result;
}

/**
 * Parses JSON text with the same result as `JsonFile.parseString()`, or returns `undefined` if the fast path
 * cannot guarantee an identical result (including all syntax errors).
 */
export function tryParseJsonLean(text: string): { value: unknown } | undefined {
  const stripped: string | undefined = stripJsonCommentsAndTrailingCommas(text);
  if (stripped === undefined) {
    return undefined;
  }

  try {
    return { value: JSON.parse(stripped) };
  } catch {
    return undefined;
  }
}
