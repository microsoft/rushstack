// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

import type { IDaemonRequestEnvelope } from '@rushstack/rush-daemon-protocol';

import type { IDaemonRequestResolver } from './DaemonRequestDispatcher';
import type { IGlobalCommandExecutionContext } from './GlobalCommandExecutionContext';
import type { GlobalCommandExecutor } from './GlobalCommandRequestRouter';

export function createNativeMutationResolver(
  envelope: IDaemonRequestEnvelope,
  rushVersion: string,
  onCompletedAsync: (context: IGlobalCommandExecutionContext) => Promise<void>
): IDaemonRequestResolver {
  if (
    envelope.commandOrigin !== 'built-in' ||
    !['install', 'update'].includes(envelope.commandName) ||
    envelope.argv[0] !== envelope.commandName
  ) {
    throw new Error('A native mutation must explicitly identify install/update and matching argv.');
  }
  const executorAsync: GlobalCommandExecutor = async (context) => {
    const forwardInput: boolean = envelope.terminal.acceptsStdin === true;
    const child: ChildProcessWithoutNullStreams = context.spawnChild(
      process.execPath,
      [path.join(__dirname, 'NativeMutationWorker.js'), rushVersion, context.cwd, ...envelope.argv],
      { forwardInput }
    );
    if (!forwardInput) child.stdin.end();
    const exitCode: number = await new Promise<number>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => {
        if (code === null)
          reject(new Error(`Native mutation worker terminated by ${signal ?? 'an unknown signal'}.`));
        else resolve(code);
      });
    });
    await onCompletedAsync(context);
    return { exitCode };
  };
  return {
    resolveRequestAsync: async () => ({ kind: 'global', executor: executorAsync })
  };
}
