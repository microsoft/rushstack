// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Keep this module free of heavy imports: start.ts loads it before @microsoft/rush-lib.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { NEVER_DAEMONIZED_COMMANDS, QUIET_FLAGS } from './earlyRouting';

/** Environment variable that selects the rush-client output mode: `agent` or `legacy`. */
export const RUSHD_OUTPUT_ENV_VAR: 'RUSHD_OUTPUT' = 'RUSHD_OUTPUT';

/**
 * Agent markers that auto-select agent output. This intentionally matches the default of
 * `detectAgent()` in `@rushstack/reporter` (libraries/reporter/src/config/AgentDetection.ts).
 */
const AGENT_MARKERS: readonly string[] = ['COPILOT_CLI'];

/** Every environment variable that `selectClientOutputMode()` reads to choose between agent and legacy output. */
export const CLIENT_OUTPUT_SELECTION_ENV_VARS: readonly string[] = [RUSHD_OUTPUT_ENV_VAR, ...AGENT_MARKERS];

const INACTIVE_VALUES: ReadonlySet<string> = new Set(['', '0', 'false', 'no', 'off']);
const NATIVE_REPORTER_FLAGS: readonly string[] = ['--reporter', '--output', '--log-level'];

export type ClientOutputMode = 'agent' | 'legacy';

function isActive(value: string | undefined): boolean {
  return value !== undefined && !INACTIVE_VALUES.has(value.trim().toLowerCase());
}

/**
 * Returns true when `RUSH_REPORTER` requests a native reporter, i.e. it is set to anything other than
 * the `legacy` escape hatch. Normalized like `isLegacyEmergencyFallbackRequested()` in `@rushstack/reporter`.
 */
export function isNativeReporterEnvironmentRequested(value: string | undefined): boolean {
  return value !== undefined && value.trim().toLowerCase() !== 'legacy';
}

/**
 * Returns the command name for early agent output, or undefined when the invocation has no plain
 * command that the daemon could run (a leading option other than `--quiet`/`-q`, `--help`/`-h`, or a command
 * that always runs in-process, such as `daemon` or `check`). Daemon admission controls (`--no-wait`,
 * `--wait-timeout SECONDS`) are skipped like `parseClientAdmissionControls()`, which is not imported
 * here to avoid loading `@rushstack/rush-daemon-protocol` before the first line; invalid controls
 * are reported later by the full parser.
 */
export function getAgentCommandName(argv: ReadonlyArray<string>): string | undefined {
  const remaining: string[] = [];
  for (let index: number = 0; index < argv.length && argv[index] !== '--'; index++) {
    const arg: string = argv[index];
    if (arg === '--wait-timeout') {
      index++;
    } else if (arg !== '--no-wait' && !arg.startsWith('--wait-timeout=')) {
      remaining.push(arg);
    }
  }
  const commandName: string | undefined = remaining.find((arg) => !QUIET_FLAGS.has(arg));
  if (
    commandName === undefined ||
    commandName.startsWith('-') ||
    NEVER_DAEMONIZED_COMMANDS.has(commandName) ||
    remaining.includes('--help') ||
    remaining.includes('-h')
  ) {
    return undefined;
  }
  return commandName;
}

/**
 * Returns true when the invocation explicitly selects a reporter, output or log level
 * (`--reporter`, `--output`, `--log-level` before `--`, `RUSH_REPORTER` other than `legacy`,
 * or `RUSH_LOG_LEVEL`). Such requests always use the native reporter path.
 */
export function hasExplicitReporterControls(
  argv: ReadonlyArray<string>,
  environment: Readonly<Record<string, string | undefined>>
): boolean {
  if (environment.RUSH_LOG_LEVEL !== undefined) {
    return true;
  }
  if (isNativeReporterEnvironmentRequested(environment.RUSH_REPORTER)) {
    return true;
  }
  const separator: number = argv.indexOf('--');
  const prefix: ReadonlyArray<string> = separator < 0 ? argv : argv.slice(0, separator);
  return prefix.some((arg) => NATIVE_REPORTER_FLAGS.some((name) => arg === name || arg.startsWith(`${name}=`)));
}

/**
 * Reads the `useRushReporter` opt-in from `common/config/rush/experiments.json` next to `rush.json`.
 * A missing or unreadable file means the opt-in is absent; in-process Rush reports invalid files.
 */
export function readUseRushReporter(rushJsonPath: string): boolean {
  const experimentsPath: string = path.join(path.dirname(rushJsonPath), 'common', 'config', 'rush', 'experiments.json');
  let contents: string;
  try {
    contents = fs.readFileSync(experimentsPath, 'utf8');
  } catch {
    return false;
  }
  const uncommented: string = contents.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  return /"useRushReporter"\s*:\s*true\b/.test(uncommented);
}

/** Finds `rush.json` in `startingFolder` or an ancestor without loading `@microsoft/rush-lib`. */
export function findRushJsonPath(startingFolder: string): string | undefined {
  let folder: string = path.resolve(startingFolder);
  for (;;) {
    const candidate: string = path.join(folder, 'rush.json');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent: string = path.dirname(folder);
    if (parent === folder) {
      return undefined;
    }
    folder = parent;
  }
}

export interface IClientOutputModeOptions {
  readonly argv: ReadonlyArray<string>;
  readonly environment: Readonly<Record<string, string | undefined>>;
  /** Whether the repository opted into the native reporter (experiments.json `useRushReporter`). */
  readonly useRushReporter?: boolean;
}

/**
 * Selects the rush-client output mode. Requests that will use the native reporter path
 * (explicit reporter controls, `--no-daemon`, or a `useRushReporter` repository) always use `legacy`,
 * so that nothing is written ahead of native reporter output. Otherwise:
 * 1. `RUSHD_OUTPUT=agent|legacy`
 * 2. an active agent marker (`COPILOT_CLI`) selects `agent`
 * 3. otherwise `legacy` (the unchanged default output)
 */
export function selectClientOutputMode(options: IClientOutputModeOptions): ClientOutputMode {
  const { argv, environment } = options;
  const separator: number = argv.indexOf('--');
  const prefix: ReadonlyArray<string> = separator < 0 ? argv : argv.slice(0, separator);
  if (options.useRushReporter || prefix.includes('--no-daemon') || hasExplicitReporterControls(argv, environment)) {
    return 'legacy';
  }
  const explicit: string | undefined = environment[RUSHD_OUTPUT_ENV_VAR]?.trim().toLowerCase();
  if (explicit === 'agent' || explicit === 'legacy') {
    return explicit;
  }
  return AGENT_MARKERS.some((name) => isActive(environment[name])) ? 'agent' : 'legacy';
}