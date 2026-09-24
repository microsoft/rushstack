// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Keep this module free of heavy imports: start.ts loads it before @microsoft/rush-lib.

/** Environment variable that selects the rush-client output mode: `agent` or `legacy`. */
export const RUSHD_OUTPUT_ENV_VAR: 'RUSHD_OUTPUT' = 'RUSHD_OUTPUT';

/**
 * Agent markers that auto-select agent output. This intentionally matches the default of
 * `detectAgent()` in `@rushstack/reporter` (libraries/reporter/src/config/AgentDetection.ts).
 */
const AGENT_MARKERS: readonly string[] = ['COPILOT_CLI'];
const INACTIVE_VALUES: ReadonlySet<string> = new Set(['', '0', 'false', 'no', 'off']);
const AI_REPORTER: 'ai' = 'ai';

export type ClientOutputMode = 'agent' | 'legacy';

function isActive(value: string | undefined): boolean {
  return value !== undefined && !INACTIVE_VALUES.has(value.trim().toLowerCase());
}

/**
 * Returns the value of the first `--reporter` flag before any `--` separator, if present.
 */
export function readReporterFlag(argv: ReadonlyArray<string>): string | undefined {
  for (let i: number = 0; i < argv.length; i++) {
    const arg: string = argv[i];
    if (arg === '--') {
      return undefined;
    }
    if (arg === '--reporter') {
      return argv[i + 1];
    }
    if (arg.startsWith('--reporter=')) {
      return arg.slice('--reporter='.length);
    }
  }
  return undefined;
}

/**
 * Returns true when the AI reporter was explicitly requested with `--reporter=ai` or `RUSH_REPORTER=ai`.
 * On the daemon path this selects the agent output instead of forcing in-process Rush.
 */
export function isAiReporterRequested(
  argv: ReadonlyArray<string>,
  environment: Readonly<Record<string, string | undefined>>
): boolean {
  const flag: string | undefined = readReporterFlag(argv);
  if (flag !== undefined) {
    return flag.trim().toLowerCase() === AI_REPORTER;
  }
  return environment.RUSH_REPORTER?.trim().toLowerCase() === AI_REPORTER;
}

/**
 * Selects the rush-client output mode. Precedence:
 * 1. `RUSHD_OUTPUT=agent|legacy`
 * 2. `--reporter=ai` (or `RUSH_REPORTER=ai`) selects `agent`
 * 3. an active agent marker (`COPILOT_CLI`) selects `agent`
 * 4. otherwise `legacy` (the unchanged default output)
 */
export function selectClientOutputMode(
  argv: ReadonlyArray<string>,
  environment: Readonly<Record<string, string | undefined>>
): ClientOutputMode {
  const explicit: string | undefined = environment[RUSHD_OUTPUT_ENV_VAR]?.trim().toLowerCase();
  if (explicit === 'agent' || explicit === 'legacy') {
    return explicit;
  }
  if (isAiReporterRequested(argv, environment)) {
    return 'agent';
  }
  return AGENT_MARKERS.some((name) => isActive(environment[name])) ? 'agent' : 'legacy';
}
