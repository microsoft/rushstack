// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A single underscore-prefixed uppercase segment of a Rush diagnostic code,
 * for example `_CONFIG`.
 *
 * @beta
 */
export type RushDiagnosticCodeSegment = `_${Uppercase<string>}`;

/**
 * One or more {@link RushDiagnosticCodeSegment} values, for example
 * `_INVALID_JSON`.
 *
 * @beta
 */
export type OneOrMoreRushDiagnosticCodeSegments<
  S extends string = RushDiagnosticCodeSegment
> = S extends string ? S | `${S}${RushDiagnosticCodeSegment}` : never;

/**
 * The shape of a stable, never-reused Rush diagnostic code:
 * `RUSH_<DOMAIN>_<NAME>`, for example `RUSH_DEPENDENCY_TOOL_FAILED`.
 *
 * @remarks
 * The type system enforces the naming convention for Rush-owned code.
 * {@link isValidRushDiagnosticCode} performs the equivalent runtime check for
 * untrusted wire data, where types have been erased.
 *
 * @beta
 */
export type RushDiagnosticCode = `RUSH${RushDiagnosticCodeSegment}${OneOrMoreRushDiagnosticCodeSegments}`;

const CODE_PREFIX: 'RUSH_' = 'RUSH_';

function isUppercaseSegmentCharacter(code: number): boolean {
  // 0-9 or A-Z
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90);
}

/**
 * Returns `true` if `code` is shaped like a valid `RUSH_<DOMAIN>_<NAME>` code.
 *
 * @remarks
 * This is the runtime companion to {@link RushDiagnosticCode} for validating
 * untrusted wire data. It is a plain string matcher rather than a regular
 * expression.
 *
 * @param code - the candidate diagnostic code
 *
 * @beta
 */
export function isValidRushDiagnosticCode(code: string): boolean {
  if (!code.startsWith(CODE_PREFIX)) {
    return false;
  }
  const body: string = code.slice(CODE_PREFIX.length);
  const segments: string[] = body.split('_');
  // A valid code has at least a domain and a name segment after the prefix.
  if (segments.length < 2) {
    return false;
  }
  for (const segment of segments) {
    if (segment.length === 0) {
      return false;
    }
    for (let i: number = 0; i < segment.length; i++) {
      if (!isUppercaseSegmentCharacter(segment.charCodeAt(i))) {
        return false;
      }
    }
  }
  return true;
}
