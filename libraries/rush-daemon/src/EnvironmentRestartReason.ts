// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { getWorkspaceFingerprintEnvironmentEntries } from '@microsoft/rush-lib';
import type { IDaemonEnvironmentChangedRestartReason } from '@rushstack/rush-daemon-protocol';

/**
 * The variables of an environment that a daemon's identity includes, by name, with the values that the workspace
 * input fingerprint hashes: without the variables that it ignores, and with repeated `PATH` entries removed.
 */
export type EnvironmentIdentityEntries = ReadonlyMap<string, string>;

/**
 * A character that would split, restyle or reorder a line that prints the name: a control character, such as a
 * newline or ESC, a line or paragraph separator, or a format character, such as a bidirectional override. A
 * backslash is escaped too, so that each escape in a printed name stands for one character of the name.
 */
const ESCAPED_CHARACTER: RegExp = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\\]/gu;

/** Returns the variables of `environment` that a daemon's identity includes. */
export function getEnvironmentIdentityEntries(
  environment: Readonly<Record<string, string | undefined>>
): EnvironmentIdentityEntries {
  return new Map(getWorkspaceFingerprintEnvironmentEntries(environment));
}

/**
 * Says why a daemon that started with `startupEntries` restarts for a request with `environment`: the sorted names
 * of the variables that are set in only one of them or set to different values, never the values. Each control,
 * format, line separator or paragraph separator character of a name, and each backslash, is written as an escape:
 * `\xHH` below U+0100 and `\u{H…}` from there on. So the client and the daemon log print the names on one line, and
 * a name that contains ESC prints differently from one that contains the text `\x1b`. Returns `undefined` when the
 * environments do not differ, which is when their fingerprint `environmentHash` is the same.
 */
export function getEnvironmentRestartReason(
  startupEntries: EnvironmentIdentityEntries,
  environment: Readonly<Record<string, string | undefined>>
): IDaemonEnvironmentChangedRestartReason | undefined {
  const requestEntries: EnvironmentIdentityEntries = getEnvironmentIdentityEntries(environment);
  const variableNames: Set<string> = new Set();
  for (const [name, value] of startupEntries) {
    if (requestEntries.get(name) !== value) variableNames.add(name);
  }
  for (const name of requestEntries.keys()) {
    if (!startupEntries.has(name)) variableNames.add(name);
  }
  if (variableNames.size === 0) return undefined;
  return { kind: 'environmentChanged', variableNames: Array.from(variableNames, escapeVariableName).sort() };
}

function escapeVariableName(name: string): string {
  return name.replace(ESCAPED_CHARACTER, (character: string) => {
    // The `u` flag matches a character above U+FFFF as one character, so this is its whole code point.
    const codePoint: number = character.codePointAt(0)!;
    const hex: string = codePoint.toString(16);
    return codePoint < 0x100 ? `\\x${hex.padStart(2, '0')}` : `\\u{${hex}}`;
  });
}
