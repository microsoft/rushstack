// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { serveRushDaemonAsync, type IRushDaemonServeOptions } from '../../serveRushDaemon';
import { TemporaryRepoWorkspaceSession } from '../TemporaryRepoWorkspaceSession';

/**
 * - `timer`: a timer that the daemon did not start keeps the process running after the daemon stops.
 * - `failing`: the same, and the daemon fails right after it starts, so its caller sets exit code 1.
 * - `nothing`: nothing keeps the process running.
 */
export type LeftBehind = 'timer' | 'failing' | 'nothing';

/**
 * - `onError`: reports through `onError`, as the Rush daemon's own entry points do.
 * - `default`: no `onError`.
 */
export type Reporter = 'onError' | 'default';

function writeJson(filename: string, value: unknown): void {
  fs.writeFileSync(`${filename}.tmp`, JSON.stringify(value));
  fs.renameSync(`${filename}.tmp`, filename);
}

function onReady(leftBehind: LeftBehind, controlFolder: string): IRushDaemonServeOptions['onReady'] {
  return (host) => {
    if (leftBehind !== 'nothing') {
      // Like a plugin or an SDK client that polls and is never stopped. Its first poll would come long after
      // the test ends, so it only keeps the process running.
      setInterval(() => undefined, 600000);
    }
    if (leftBehind === 'failing') throw new Error('The fixture failed after it started.');
    writeJson(path.join(controlFolder, 'ready.json'), { paths: host.paths });
  };
}

async function runAsync(): Promise<void> {
  const [repoRoot, controlFolder, leftBehind, reporter] = process.argv.slice(2);
  if (!repoRoot || !controlFolder || !leftBehind || !reporter) {
    throw new Error(
      'The fixture needs a repository folder, a control folder, what it leaves behind and a reporter.'
    );
  }
  try {
    // Process mode: no shutdownSignal, so the daemon handles SIGINT and SIGTERM itself.
    await serveRushDaemonAsync({
      repoRoot,
      rushVersion: '5.178.1',
      daemonVersion: 'lingering-fixture',
      createWorkspaceSessionAsync: () => Promise.resolve(new TemporaryRepoWorkspaceSession(repoRoot)),
      onReady: onReady(leftBehind as LeftBehind, controlFolder),
      onError:
        (reporter as Reporter) === 'onError'
          ? (error: Error) => process.stderr.write(`${error.stack ?? error.message}\n`)
          : undefined
    });
  } finally {
    writeJson(path.join(controlFolder, 'stopped.json'), { stoppedAtMs: Date.now() });
  }
}

if (require.main === module) {
  void runAsync().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    process.exitCode = 1;
  });
}
