// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ChildProcess } from 'node:child_process';
import * as path from 'node:path';

import {
  Executable,
  type IExecutableSpawnOptions,
  type IWaitForExitResult
} from '@rushstack/node-core-library';
import { TerminalStreamWritable, TerminalProviderSeverity, type ITerminal } from '@rushstack/terminal';

export async function executeAndWaitAsync(
  terminal: ITerminal,
  command: string,
  args: string[],
  options: Omit<IExecutableSpawnOptions, 'stdio'> = {}
): Promise<IWaitForExitResult<string>> {
  const childProcess: ChildProcess = Executable.spawn(command, args, {
    ...options,
    stdio: [
      'ignore', // stdin
      'pipe', // stdout
      'pipe' // stderr
    ]
  });
  childProcess.stdout?.pipe(
    new TerminalStreamWritable({
      terminal,
      severity: TerminalProviderSeverity.log
    })
  );
  childProcess.stderr?.pipe(
    new TerminalStreamWritable({
      terminal,
      severity: TerminalProviderSeverity.error
    })
  );
  const result: IWaitForExitResult<string> = await Executable.waitForExitAsync(childProcess, {
    encoding: 'utf8'
  });
  return result;
}

const vsceBasePackagePath: string = require.resolve('@vscode/vsce/package.json');
export const vsceScriptPath: string = path.resolve(vsceBasePackagePath, '../vsce');
