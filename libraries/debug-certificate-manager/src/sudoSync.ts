// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as child_process from 'child_process';
// eslint-disable-next-line
const sudo: (args: string[], options: any) => child_process.ChildProcess = require('sudo');
// eslint-disable-next-line
const deasync: { sleep: (ms: number) => void } = require('deasync');

export interface ISudoSyncResult {
  stdout: string[];
  stderr: string[];
  code: number;
}

export function runSudoSync(params: string[]): ISudoSyncResult {
  const sudoResult: child_process.ChildProcess = sudo(
    params,
    {
      cachePassword: false,
      prompt: 'Enter your password: '
    }
  );

  const stderr: string[] = [];
  sudoResult.stderr.on('data', (data: Buffer) => {
    stderr.push(data.toString());
  });

  const stdout: string[] = [];
  sudoResult.stdout.on('data', (data: Buffer) => {
    stdout.push(data.toString());
  });

  let code: number | undefined;
  sudoResult.on('close', (exitCode: number) => {
    code = exitCode;
  });

  // Because we're running with sudo, we can't run synchronously, so synchronize by polling.

  // eslint-disable-next-line no-unmodified-loop-condition
  while (code === undefined) {
    deasync.sleep(100);
  }

  return { code, stdout, stderr };
}