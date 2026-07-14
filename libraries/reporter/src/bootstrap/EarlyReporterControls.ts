// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The early reporter controls parsed by the bootstrap prelude.
 *
 * @remarks
 * The prelude parses only the minimal subset needed to configure bootstrap
 * reporting before `rush-lib` loads. Full selection and precedence are resolved
 * later by the frontend.
 *
 * @beta
 */
export interface IEarlyReporterControls {
  /**
   * The explicitly requested reporter name, if any.
   */
  readonly reporter?: string;

  /**
   * The explicitly requested log level, if any.
   */
  readonly logLevel?: string;
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

/**
 * Parses the early reporter controls from the command line and environment.
 *
 * @remarks
 * Precedence favors explicit command-line controls over environment variables.
 * The verbosity aliases `--quiet`/`-q`, `--verbose`, and `--debug` map to log
 * levels. This is the minimal early subset; the frontend resolves full
 * precedence, including agent and CI detection.
 *
 * @param argv - the command-line arguments, excluding the node executable and script
 * @param env - the environment variables
 *
 * @beta
 */
export function parseEarlyReporterControls(
  argv: readonly string[],
  env: Record<string, string | undefined>
): IEarlyReporterControls {
  const reporter: string | undefined = readFlagValue(argv, '--reporter') ?? env.RUSH_REPORTER ?? undefined;

  let logLevel: string | undefined = readFlagValue(argv, '--log-level') ?? env.RUSH_LOG_LEVEL;

  if (logLevel === undefined) {
    if (argv.includes('--debug')) {
      logLevel = 'debug';
    } else if (argv.includes('--verbose')) {
      logLevel = 'verbose';
    } else if (argv.includes('--quiet') || argv.includes('-q')) {
      logLevel = 'quiet';
    } else {
      const quietMode: string | undefined = env.RUSH_QUIET_MODE;
      if (quietMode === '1' || quietMode === 'true') {
        logLevel = 'quiet';
      }
    }
  }

  const controls: { reporter?: string; logLevel?: string } = {};
  if (reporter !== undefined) {
    controls.reporter = reporter;
  }
  if (logLevel !== undefined) {
    controls.logLevel = logLevel;
  }
  return controls;
}
