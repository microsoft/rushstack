// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The prefix of every Rush diagnostic code.
 *
 * @remarks
 * "RDC" (Rush Diagnostic Code) is deliberately distinctive so that codes are
 * trivially recognizable -- and matchable with a plain string prefix check --
 * across every boundary the reporter contract crosses: producer processes,
 * the NDJSON wire, reporter destinations, and telemetry.
 *
 * @beta
 */
export const RUSH_DIAGNOSTIC_CODE_PREFIX: 'RDC_' = 'RDC_';

/**
 * The stable code used for unexpected internal (programmer) failures.
 *
 * @beta
 */
export const RUSH_INTERNAL_ERROR_CODE: 'RDC_INTERNAL_UNEXPECTED' = 'RDC_INTERNAL_UNEXPECTED';

/**
 * Type arithmetic enforcing the `RDC_<DOMAIN>_<NAME>` diagnostic code naming
 * convention at compile time.
 *
 * @remarks
 * Resolves to `TCode` when it is a valid code -- the {@link RUSH_DIAGNOSTIC_CODE_PREFIX}
 * prefix followed by at least two non-empty, uppercase `A-Z`/`0-9` segments --
 * and to `never` otherwise. Authoring APIs accept
 * `TCode & ValidateRushDiagnosticCode<TCode>` so that a malformed code is a
 * compile error at the definition site rather than a runtime failure in a
 * producer process.
 *
 * The type system intentionally approximates the character set (it enforces
 * uppercase, not `[A-Z0-9]` exactly); {@link isValidRushDiagnosticCode} is the
 * exact matcher for untyped input such as decoded wire payloads.
 *
 * @beta
 */
export type ValidateRushDiagnosticCode<TCode extends string> =
  TCode extends `${typeof RUSH_DIAGNOSTIC_CODE_PREFIX}${infer TRest}`
    ? TRest extends `${infer TDomain}_${infer TName}`
      ? TDomain extends ''
        ? never
        : TName extends '' | `_${string}`
          ? never
          : TDomain extends Uppercase<TDomain>
            ? TName extends Uppercase<TName>
              ? TCode
              : never
            : never
      : never
    : never;

const UNDERSCORE: number = 95; // '_'
const DIGIT_ZERO: number = 48; // '0'
const DIGIT_NINE: number = 57; // '9'
const LETTER_A: number = 65; // 'A'
const LETTER_Z: number = 90; // 'Z'

/**
 * Returns `true` if `code` is shaped like a valid `RDC_<DOMAIN>_<NAME>` code.
 *
 * @remarks
 * This is the exact matcher for untyped input (for example, a diagnostic that
 * arrived over the wire). It is a plain string scan -- no regular expression --
 * so it is cheap enough to run at system boundaries. Typed Rush code should
 * instead rely on the compile-time enforcement of
 * {@link ValidateRushDiagnosticCode} and the registered-code union accepted by
 * `createRushDiagnostic`.
 *
 * @param code - the candidate diagnostic code
 *
 * @beta
 */
export function isValidRushDiagnosticCode(code: string): boolean {
  if (!code.startsWith(RUSH_DIAGNOSTIC_CODE_PREFIX)) {
    return false;
  }

  const body: string = code.slice(RUSH_DIAGNOSTIC_CODE_PREFIX.length);
  if (body.length === 0) {
    return false;
  }

  let segmentCount: number = 1;
  let segmentIsEmpty: boolean = true;
  for (let i: number = 0; i < body.length; i++) {
    const char: number = body.charCodeAt(i);
    if (char === UNDERSCORE) {
      if (segmentIsEmpty) {
        return false; // an empty segment, e.g. a leading or doubled underscore
      }
      segmentCount++;
      segmentIsEmpty = true;
    } else if ((char >= LETTER_A && char <= LETTER_Z) || (char >= DIGIT_ZERO && char <= DIGIT_NINE)) {
      segmentIsEmpty = false;
    } else {
      return false;
    }
  }

  return !segmentIsEmpty && segmentCount >= 2;
}
