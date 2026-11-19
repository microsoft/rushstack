// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Rush } from '@microsoft/rush-lib';
import { RushCommandLineParser } from '@microsoft/rush-lib/lib/cli/RushCommandLineParser';

/**
 * This entrypoint is deliberately a separate, single-shot process. It is not used for phased builds.
 * Native install/update retain their normal parsing, policy, hooks, cwd and environment behavior here.
 */
export async function runNativeMutationWorkerAsync(args: ReadonlyArray<string>): Promise<void> {
  const [rushVersion, cwd, commandName, ...commandArgs] = args;
  if (rushVersion !== Rush.version) {
    throw new Error(`Mutation worker contains Rush ${Rush.version}, not requested Rush ${rushVersion}.`);
  }
  if (!cwd || (commandName !== 'install' && commandName !== 'update')) {
    throw new Error('The native mutation worker accepts install or update only.');
  }
  const parser: RushCommandLineParser = new RushCommandLineParser({ cwd });
  if (!(await parser.executeAsync([commandName, ...commandArgs]))) process.exitCode ||= 1;
}

if (require.main === module) {
  void runNativeMutationWorkerAsync(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    process.exitCode = 1;
  });
}
