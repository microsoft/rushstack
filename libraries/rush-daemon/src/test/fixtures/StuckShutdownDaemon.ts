// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { LockFile, SubprocessTerminator } from '@rushstack/node-core-library';

import type { IResolveDaemonRequestOptions } from '../../DaemonRequestDispatcher';
import { serveRushDaemonAsync } from '../../serveRushDaemon';
import { CallbackDaemonRequestResolver } from '../DaemonRequestWireTestUtilities';
import { TemporaryRepoWorkspaceSession } from '../TemporaryRepoWorkspaceSession';

// Outlives the test, but ends by itself if a failed test leaves it behind.
const OPERATION_SCRIPT: string = 'setTimeout(() => undefined, 60000);';

function writeJson(filename: string, value: unknown): void {
  fs.writeFileSync(`${filename}.tmp`, JSON.stringify(value));
  fs.renameSync(`${filename}.tmp`, filename);
}

/**
 * Like a request that holds the repository lock and runs an operation, and then waits for a lock that another
 * process holds: it ignores its abort signal and never settles.
 */
async function runStuckRequestAsync(
  options: IResolveDaemonRequestOptions,
  controlFolder: string
): Promise<never> {
  const repoLock: LockFile | undefined = LockFile.tryAcquire(
    options.workspaceSession.rushConfiguration.commonTempFolder,
    'rush'
  );
  if (!repoLock) throw new Error('The repository lock is taken.');
  const operation: ChildProcess = spawn(process.execPath, ['-e', OPERATION_SCRIPT], {
    ...SubprocessTerminator.RECOMMENDED_OPTIONS,
    stdio: 'ignore'
  });
  SubprocessTerminator.killProcessTreeOnExit(operation, SubprocessTerminator.RECOMMENDED_OPTIONS);
  await new Promise<void>((resolve, reject) => {
    operation.once('spawn', resolve);
    operation.once('error', reject);
  });
  writeJson(path.join(controlFolder, 'request.json'), { operationPid: operation.pid });
  return await new Promise<never>(() => undefined);
}

async function runAsync(): Promise<void> {
  const [repoRoot, controlFolder, shutdownDeadlineMs] = process.argv.slice(2);
  if (!repoRoot || !controlFolder || !shutdownDeadlineMs) {
    throw new Error('The fixture needs a repository folder, a control folder and a shutdown deadline.');
  }
  // Process mode: no shutdownSignal, so the daemon handles SIGINT and SIGTERM itself.
  await serveRushDaemonAsync({
    repoRoot,
    rushVersion: '5.178.1',
    daemonVersion: 'stuck-shutdown-fixture',
    shutdownDeadlineMs: Number(shutdownDeadlineMs),
    createWorkspaceSessionAsync: () => Promise.resolve(new TemporaryRepoWorkspaceSession(repoRoot)),
    requestResolver: new CallbackDaemonRequestResolver((options: IResolveDaemonRequestOptions) =>
      runStuckRequestAsync(options, controlFolder)
    ),
    onReady: (host) => writeJson(path.join(controlFolder, 'ready.json'), { paths: host.paths }),
    onError: (error: Error) => process.stderr.write(`${error.stack ?? error.message}\n`)
  });
}

if (require.main === module) {
  void runAsync().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    process.exitCode = 1;
  });
}
