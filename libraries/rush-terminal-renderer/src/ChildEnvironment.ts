// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonClientCaps } from '@rushstack/rush-daemon-protocol';

const FORCE_COLOR_VAR: string = 'FORCE_COLOR';
const COLUMNS_VAR: string = 'COLUMNS';
const DEFAULT_TTY_COLOR_LEVEL: number = 1;

function getColumnsOverride(columns: number | undefined): Record<string, string> {
  return columns === undefined ? {} : { [COLUMNS_VAR]: String(columns) };
}

/**
 * Computes the environment overrides a child process inherits from one
 * client's request envelope.
 *
 * @remarks
 * A TTY client's child receives `FORCE_COLOR` (its `colorLevel`, defaulting to
 * `1`) and `COLUMNS` (when known); a non-TTY client's child receives neither.
 * The result is computed fresh per request and never cached, so concurrent
 * clients cannot contaminate each other.
 *
 * @beta
 */
export function getDaemonChildEnvironmentOverrides(caps: IDaemonClientCaps): Record<string, string> {
  if (!caps.isTTY) {
    return {};
  }
  return {
    [FORCE_COLOR_VAR]: String(caps.colorLevel ?? DEFAULT_TTY_COLOR_LEVEL),
    ...getColumnsOverride(caps.columns)
  };
}

/**
 * Merges per-client overrides into a base environment, removing any ambient
 * `FORCE_COLOR`/`COLUMNS` first so a non-TTY client's child provably receives
 * neither variable.
 *
 * @beta
 */
export function applyDaemonChildEnvironment(
  baseEnv: Readonly<Record<string, string | undefined>>,
  caps: IDaemonClientCaps
): Record<string, string | undefined> {
  const filtered: [string, string | undefined][] = Object.entries(baseEnv).filter(
    ([key]: [string, string | undefined]) => key !== FORCE_COLOR_VAR && key !== COLUMNS_VAR
  );
  return { ...Object.fromEntries(filtered), ...getDaemonChildEnvironmentOverrides(caps) };
}
