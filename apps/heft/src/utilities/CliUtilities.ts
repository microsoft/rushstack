// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Parse the arguments to the tool being executed and return the tool argument names.
 *
 * @param argv - The arguments to parse. Defaults to `process.argv`.
 */
export function getToolParameterNamesFromArgs(argv: string[] = process.argv): Set<string> {
  const toolParameters: Set<string> = new Set();
  // Skip the first two arguments, which are the path to the Node executable and the path to the Heft
  // entrypoint. The remaining arguments are the tool arguments. Grab them until we reach a non-"-"-prefixed
  // argument. We can do this simple parsing because the Heft tool only has simple optional flags.
  for (let i: number = 2; i < argv.length; ++i) {
    const arg: string = argv[i];
    if (!arg.startsWith('-')) {
      break;
    }
    toolParameters.add(arg);
  }
  return toolParameters;
}

/**
 * Get the exit code for a Heft process that is exiting because of an error. This is `exitCode` if it
 * is a positive integer, and 1 otherwise, so it is never 0.
 *
 * @param exitCode - The current value of `process.exitCode`. Code that ran in the Heft process, such as
 * a test that Jest ran in band, may have set it to 0.
 */
export function getErrorExitCode(exitCode: string | number | undefined): number {
  const numericExitCode: number = Number(exitCode);
  return Number.isInteger(numericExitCode) && numericExitCode > 0 ? numericExitCode : 1;
}
