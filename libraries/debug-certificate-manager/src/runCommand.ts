// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Executable } from '@rushstack/node-core-library';
import type * as child_process from 'child_process';

export interface IRunResult {
  stdout: string[];
  stderr: string[];
  code: number;
}

export interface ISudoOptions {
  cachePassword?: boolean;
  prompt?: string;
  spawnOptions?: object;
}

export async function runSudoAsync(command: string, params: string[]): Promise<IRunResult> {
  const sudo: (args: string[], options: ISudoOptions) => child_process.ChildProcess = require('sudo');
  const result: child_process.ChildProcess = sudo([command, ...params], {
    cachePassword: false,
    prompt: 'Enter your password: '
  });
  return await _handleChildProcess(result);
}

export async function runAsync(command: string, params: string[]): Promise<IRunResult> {
  const result: child_process.ChildProcess = Executable.spawn(command, params);
  return await _handleChildProcess(result);
}

async function _handleChildProcess(childProcess: child_process.ChildProcess): Promise<IRunResult> {
  return await new Promise((resolve: (result: IRunResult) => void) => {
    const stderr: string[] = [];
    childProcess.stderr?.on('data', (data: Buffer) => {
      stderr.push(data.toString());
    });

    const stdout: string[] = [];
    childProcess.stdout?.on('data', (data: Buffer) => {
      stdout.push(data.toString());
    });

    childProcess.on('close', (code: number) => {
      resolve({ code, stdout, stderr });
    });
  });
}
