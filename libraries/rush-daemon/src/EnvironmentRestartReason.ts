// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { getWorkspaceFingerprintEnvironmentEntries } from '@microsoft/rush-lib';
import type { IDaemonEnvironmentChangedRestartReason } from '@rushstack/rush-daemon-protocol';

/**
 * The variables of an environment that a daemon's identity includes, by name, with the values that the workspace
 * input fingerprint hashes: without the variables that it ignores, and with repeated `PATH` entries removed.
 */
export type EnvironmentIdentityEntries = ReadonlyMap<string, string>;

/** Returns the variables of `environment` that a daemon's identity includes. */
export function getEnvironmentIdentityEntries(
  environment: Readonly<Record<string, string | undefined>>
): EnvironmentIdentityEntries {
  return new Map(getWorkspaceFingerprintEnvironmentEntries(environment));
}

/**
 * Says why a daemon that started with `startupEntries` restarts for a request with `environment`: the sorted names
 * of the variables that are set in only one of them or set to different values, never the values. Returns
 * `undefined` when the environments do not differ, which is when their fingerprint `environmentHash` is the same.
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
  return { kind: 'environmentChanged', variableNames: Array.from(variableNames).sort() };
}
