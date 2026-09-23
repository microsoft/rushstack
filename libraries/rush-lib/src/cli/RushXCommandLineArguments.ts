// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Colorize } from '@rushstack/terminal';

import { EnvironmentVariableNames } from '../api/EnvironmentConfiguration';

/** Native Rushx arguments. Options after the command belong to the script. @beta */
export interface IRushXCommandLineArguments {
  /**
   * Flag indicating whether to suppress any rushx startup information.
   */
  quiet: boolean;

  /**
   * Flag indicating whether the user has asked for help.
   */
  help: boolean;

  /**
   * Flag indicating whether the user has requested debug mode.
   */
  isDebug: boolean;

  /**
   * Flag indicating whether the user wants to not call hooks.
   */
  ignoreHooks: boolean;

  /**
   * The command to run (i.e., the target "script" in package.json.)
   */
  commandName: string;

  /**
   * Any additional arguments/parameters passed after the command name.
   */
  commandArgs: string[];
}

/**
 * Parses native Rushx arguments. This module does not load the rest of the Rush engine, so that callers
 * such as the standalone client can route a Rushx invocation cheaply.
 */
export function parseRushXCommandLineArguments(
  args: ReadonlyArray<string>,
  environment: Readonly<NodeJS.ProcessEnv>,
  reportUnknownArguments?: (message: string) => void
): IRushXCommandLineArguments {
  const unknownArgs: string[] = [];

  let help: boolean = false;
  let quiet: boolean = false;
  let commandName: string = '';
  let isDebug: boolean = false;
  let ignoreHooks: boolean = false;
  const commandArgs: string[] = [];

  for (let index: number = 0; index < args.length; index++) {
    const argValue: string = args[index];

    if (!commandName) {
      if (argValue === '-q' || argValue === '--quiet') {
        quiet = true;
      } else if (argValue === '-h' || argValue === '--help') {
        help = true;
      } else if (argValue === '-d' || argValue === '--debug') {
        isDebug = true;
      } else if (argValue === '--ignore-hooks') {
        ignoreHooks = true;
      } else if (argValue.startsWith('-')) {
        unknownArgs.push(args[index]);
      } else {
        commandName = args[index];
      }
    } else {
      commandArgs.push(args[index]);
    }
  }

  const quietModeValue: string | undefined = environment[EnvironmentVariableNames.RUSH_QUIET_MODE];
  if (quietModeValue === '1' || quietModeValue === 'true') {
    quiet = true;
  }

  if (!commandName) {
    help = true;
  }

  if (unknownArgs.length > 0) {
    // Future TODO: Instead of just displaying usage info, we could display a
    // specific error about the unknown flag the user tried to pass to rushx.
    reportUnknownArguments?.(
      Colorize.red(`Unknown arguments: ${unknownArgs.map((x) => JSON.stringify(x)).join(', ')}`)
    );
    help = true;
  }

  return {
    help,
    quiet,
    isDebug,
    ignoreHooks,
    commandName,
    commandArgs
  };
}
