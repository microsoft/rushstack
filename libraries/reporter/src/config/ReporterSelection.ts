// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  isSupportedReporterName,
  isSupportedLogLevel,
  type ReporterName,
  type ReporterLogLevel
} from './ReporterNames';
import { detectAgent, isCiDetected } from './AgentDetection';
import { parseOutputControl, type IReporterOutputTarget } from './OutputControl';
import { separateJsonControls } from '../exit/CommandJson';

/**
 * The inputs used to resolve the reporter selection.
 *
 * @beta
 */
export interface IReporterSelectionInput {
  /**
   * The command-line arguments, excluding the node executable and script.
   */
  readonly argv: readonly string[];

  /**
   * The environment variables.
   */
  readonly env: Record<string, string | undefined>;

  /**
   * Whether the output stream is an interactive TTY.
   */
  readonly isTTY: boolean;

  /**
   * Agent environment variable names configured in rush.json.
   */
  readonly agentEnvironmentVariables?: readonly string[];
}

/**
 * The resolved reporter selection.
 *
 * @beta
 */
export interface IReporterSelection {
  /**
   * The primary reporter.
   */
  readonly primaryReporter: ReporterName;

  /**
   * The additional reporters, such as the full-detail file reporter.
   */
  readonly additionalReporters: readonly ReporterName[];

  /**
   * The resolved log level.
   */
  readonly logLevel: ReporterLogLevel;

  /**
   * A short explanation of why the primary reporter was chosen.
   */
  readonly reason: string;

  /**
   * The explicit `--output` targets.
   */
  readonly outputs: readonly IReporterOutputTarget[];

  /**
   * Whether the command-specific `--json` flag was requested. It never selects
   * the json reporter.
   */
  readonly commandJson: boolean;
}

function readFlagValue(argv: readonly string[], flag: string): string | undefined {
  const prefix: string = `${flag}=`;
  for (let index: number = 0; index < argv.length; index++) {
    const arg: string = argv[index];
    if (arg.startsWith(prefix)) {
      return arg.slice(prefix.length);
    }
    if (arg === flag && index + 1 < argv.length) {
      return argv[index + 1];
    }
  }
  return undefined;
}

function readAllFlagValues(argv: readonly string[], flag: string): string[] {
  const prefix: string = `${flag}=`;
  const values: string[] = [];
  for (let index: number = 0; index < argv.length; index++) {
    const arg: string = argv[index];
    if (arg.startsWith(prefix)) {
      values.push(arg.slice(prefix.length));
    } else if (arg === flag && index + 1 < argv.length) {
      values.push(argv[index + 1]);
    }
  }
  return values;
}

function resolvePrimaryReporter(input: IReporterSelectionInput): { reporter: ReporterName; reason: string } {
  const cliReporter: string | undefined = readFlagValue(input.argv, '--reporter');
  if (cliReporter !== undefined) {
    if (!isSupportedReporterName(cliReporter)) {
      throw new Error(`Unsupported reporter requested with --reporter: ${JSON.stringify(cliReporter)}`);
    }
    return { reporter: cliReporter, reason: 'explicit --reporter' };
  }

  const envReporter: string | undefined = input.env.RUSH_REPORTER;
  if (envReporter !== undefined && envReporter.length > 0) {
    if (!isSupportedReporterName(envReporter)) {
      throw new Error(`Unsupported reporter requested with RUSH_REPORTER: ${JSON.stringify(envReporter)}`);
    }
    return { reporter: envReporter, reason: 'RUSH_REPORTER' };
  }

  if (detectAgent(input.env, input.agentEnvironmentVariables)) {
    return { reporter: 'ai', reason: 'agent detected' };
  }
  if (isCiDetected(input.env)) {
    return { reporter: 'plaintext', reason: 'CI detected' };
  }
  if (input.isTTY) {
    return { reporter: 'default', reason: 'interactive TTY' };
  }
  return { reporter: 'plaintext', reason: 'generic non-TTY' };
}

function resolveLogLevel(argv: readonly string[], env: Record<string, string | undefined>): ReporterLogLevel {
  const signals: ReporterLogLevel[] = [];

  const cliLevel: string | undefined = readFlagValue(argv, '--log-level');
  if (cliLevel !== undefined) {
    if (!isSupportedLogLevel(cliLevel)) {
      throw new Error(`Unsupported log level requested with --log-level: ${JSON.stringify(cliLevel)}`);
    }
    signals.push(cliLevel);
  }
  if (argv.includes('--quiet') || argv.includes('-q')) {
    signals.push('quiet');
  }
  if (argv.includes('--verbose')) {
    signals.push('verbose');
  }
  if (argv.includes('--debug')) {
    signals.push('debug');
  }

  const distinct: Set<ReporterLogLevel> = new Set(signals);
  if (distinct.size > 1) {
    throw new Error(`Contradictory log level controls: ${[...distinct].sort().join(', ')}`);
  }
  if (distinct.size === 1) {
    return signals[0];
  }

  const envLevel: string | undefined = env.RUSH_LOG_LEVEL;
  if (envLevel !== undefined && envLevel.length > 0) {
    if (!isSupportedLogLevel(envLevel)) {
      throw new Error(`Unsupported log level requested with RUSH_LOG_LEVEL: ${JSON.stringify(envLevel)}`);
    }
    return envLevel;
  }

  return 'normal';
}

/**
 * Resolves the reporter selection from the command line and environment.
 *
 * @remarks
 * Precedence for the primary reporter runs from explicit CLI controls, through
 * `RUSH_REPORTER`, agent detection, CI detection, and interactive TTY, down to
 * generic non-TTY plaintext. The log level is resolved independently, with the
 * `--quiet`, `--verbose`, and `--debug` aliases mapping to levels;
 * contradictory verbosity controls are rejected. The command-specific `--json`
 * flag is preserved and never selects the json reporter. Explicit unsupported
 * reporter or log-level requests fail.
 *
 * @param input - the command line, environment, and TTY state
 *
 * @beta
 */
export function resolveReporterSelection(input: IReporterSelectionInput): IReporterSelection {
  const { reporter, reason } = resolvePrimaryReporter(input);
  const logLevel: ReporterLogLevel = resolveLogLevel(input.argv, input.env);
  const outputs: IReporterOutputTarget[] = readAllFlagValues(input.argv, '--output').map(parseOutputControl);
  const additionalReporters: ReporterName[] = reporter === 'file' ? [] : ['file'];
  const commandJson: boolean = separateJsonControls(input.argv).commandJson;

  return {
    primaryReporter: reporter,
    additionalReporters,
    logLevel,
    reason,
    outputs,
    commandJson
  };
}
