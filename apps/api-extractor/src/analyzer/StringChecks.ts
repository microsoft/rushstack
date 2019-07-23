// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Helpers for validating various text string formats.
 */
export class StringChecks {
  // Note: In addition to letters, numbers, underscores, and dollar signs, modern ECMAScript
  // also allows Unicode categories such as letters, combining marks, digits, and connector punctuation.
  // These are mostly supported in all environments except IE11, so if someone wants it, we would accept
  // a PR to allow them (although the test surface might be somewhat large).
  private static readonly _identifierBadCharRegExp: RegExp = /[^a-z0-9_$]/i;

  // Identifiers most not start with a number.
  private static readonly _identifierNumberStartRegExp: RegExp = /^[0-9]/;

  /**
   * Tests whether the input string is safe to use as an ECMAScript identifier without quotes.
   *
   * @remarks
   * For example:
   *
   * ```ts
   * class X {
    *   public okay: number = 1;
    *   public "not okay!": number = 2;
    * }
    * ```
    *
    * A precise check is extremely complicated and highly dependent on the ECMAScript standard version
    * and how faithfully the interpreter implements it.  To keep things simple, `isValidUnquotedIdentifier()`
    * conservatively checks for basic alphanumeric identifiers and returns false otherwise.
    *
    * Based on `StringChecks.explainIfInvalidUnquotedIdentifier()` from TSDoc.
    */
   public static isSafeUnquotedMemberIdentifier(identifier: string): boolean {
    if (identifier.length === 0) {
      return false; // cannot be empty
    }

    if (StringChecks._identifierBadCharRegExp.test(identifier)) {
      return false; // cannot contain bad characters
    }

    if (StringChecks._identifierNumberStartRegExp.test(identifier)) {
      return false; // cannot start with a number
    }

    return true;
  }
}
