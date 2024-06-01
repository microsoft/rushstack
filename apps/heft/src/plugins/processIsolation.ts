// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
/**
 * Spawns a new process with the given environment variables.
 * @param command - The command to run.
 * @param args - The list of string arguments.
 * @param options - The options, including environment variables.
 * @returns A promise that resolves to the child process.
 */
export function spawnProcess(
  command: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv }
): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(command, args, { env: options.env, stdio: 'inherit' });

    child.on('error', (err: Error) => {
      reject(err);
    });

    child.on('exit', (code: number | null) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Process exited with code ${code}`));
      } else {
        resolve(child);
      }
    });
  });
}

/**
 * Spawns an isolated process with the given environment variables.
 * @param environmentVariables - Environment variables to set.
 * @returns A promise that resolves to the child process.
 */
export async function spawnIsolatedProcess(
  environmentVariables: Record<string, string | undefined>
): Promise<ChildProcess> {
  const filteredEnv: Record<string, string | undefined> = Object.fromEntries(
    Object.entries(environmentVariables).filter(([key, value]) => value !== undefined)
  );
  const isolatedEnv: Record<string, string | undefined> = { ...process.env, ...filteredEnv };
  const childProcess: ChildProcess = await spawnProcess('node', ['-e', ''], { env: isolatedEnv });
  return childProcess;
}
