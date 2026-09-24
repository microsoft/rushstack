// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { EnvironmentConfiguration, EnvironmentVariableNames } from '@microsoft/rush-lib';

const BOOLEAN_VARIABLES: ReadonlySet<string> = new Set([
  EnvironmentVariableNames.RUSH_ABSOLUTE_SYMLINKS,
  EnvironmentVariableNames.RUSH_ALLOW_WARNINGS_IN_SUCCESSFUL_BUILD,
  EnvironmentVariableNames.RUSH_BUILD_CACHE_ENABLED,
  EnvironmentVariableNames.RUSH_BUILD_CACHE_WRITE_ALLOWED,
  EnvironmentVariableNames.RUSH_COBUILD_LEAF_PROJECT_LOG_ONLY_ALLOWED
]);

// These also accept the legacy "true"/"false" spellings.
const LEGACY_BOOLEAN_VARIABLES: ReadonlySet<string> = new Set([
  EnvironmentVariableNames.RUSH_ALLOW_UNSUPPORTED_NODEJS,
  EnvironmentVariableNames.RUSH_QUIET_MODE
]);

const KNOWN_VARIABLES: ReadonlySet<string> = new Set(Object.values(EnvironmentVariableNames));

/**
 * Applies the same checks as `EnvironmentConfiguration.validate()` to a request-scoped environment,
 * without touching this process's environment or the global configuration state.
 *
 * @remarks
 * A request whose environment differs from the daemon's plans a process restart, and the successor
 * validates that environment during startup. Validating it first lets the request fail with the native
 * message while the current daemon stays available, instead of replacing a healthy daemon with a
 * successor that can never start.
 *
 * @throws An error with the same message as native Rush for the first invalid value.
 */
export function validateRequestRushEnvironment(environment: Readonly<Record<string, string | undefined>>): void {
  const unknown: string[] = [];
  const present: Set<string> = new Set();
  for (const [name, value] of Object.entries(environment)) {
    if (!/^RUSH_/i.test(name)) continue;
    // Environment variable names are only case-insensitive on Windows.
    const normalizedName: string = process.platform === 'win32' ? name.toUpperCase() : name;
    if (!KNOWN_VARIABLES.has(normalizedName)) {
      unknown.push(name);
      continue;
    }
    if (value) present.add(normalizedName);
    if (BOOLEAN_VARIABLES.has(normalizedName) || LEGACY_BOOLEAN_VARIABLES.has(normalizedName)) {
      if (LEGACY_BOOLEAN_VARIABLES.has(normalizedName) && (value === 'true' || value === 'false')) continue;
      EnvironmentConfiguration.parseBooleanEnvironmentVariable(normalizedName, value);
    }
  }
  if (unknown.length > 0) {
    throw new Error(
      'The following environment variables were found with the "RUSH_" prefix, but they are not ' +
        `recognized by this version of Rush: ${unknown.join(', ')}`
    );
  }
  if (
    present.has(EnvironmentVariableNames.RUSH_BUILD_CACHE_OVERRIDE_JSON_FILE_PATH) &&
    present.has(EnvironmentVariableNames.RUSH_BUILD_CACHE_OVERRIDE_JSON)
  ) {
    throw new Error(
      `Environment variable ${EnvironmentVariableNames.RUSH_BUILD_CACHE_OVERRIDE_JSON_FILE_PATH} and ` +
        `${EnvironmentVariableNames.RUSH_BUILD_CACHE_OVERRIDE_JSON} are mutually exclusive. ` +
        `Only one may be specified.`
    );
  }
}