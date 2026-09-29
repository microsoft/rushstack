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
 * - `callbacks`: passes `onError` and `onLog`, as the Rush daemon's own entry points do. Each one writes with its
 *   own prefix, `fixture error: ` or `fixture log: `, so that a test can tell the paths apart.
 * - `default`: neither.
 */
export type Reporter = 'callbacks' | 'default';

/**
 * - `process`: no `shutdownSignal`, so the daemon owns its process and handles SIGINT and SIGTERM itself.
 * - `embedded`: the fixture passes a `shutdownSignal` that it never aborts. It owns the process, and the daemon
 *   stops only when a client stops it.
 */
export type Ownership = 'process' | 'embedded';

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

function getReporterOptions(reporter: Reporter): Pick<IRushDaemonServeOptions, 'onError' | 'onLog'> {
  if (reporter === 'default') return {};
  return {
    onError: (error: Error) => process.stderr.write(`fixture error: ${error.stack ?? error.message}\n`),
    onLog: (message: string) => process.stderr.write(`fixture log: ${message}\n`)
  };
}

async function runAsync(): Promise<void> {
  const [repoRoot, controlFolder, leftBehind, reporter, ownership] = process.argv.slice(2);
  if (!repoRoot || !controlFolder || !leftBehind || !reporter || !ownership) {
    throw new Error(
      'The fixture needs a repository, a control folder, what it leaves behind, a reporter and an owner.'
    );
  }
  try {
    await serveRushDaemonAsync({
      repoRoot,
      rushVersion: '5.178.1',
      daemonVersion: 'lingering-fixture',
      createWorkspaceSessionAsync: () => Promise.resolve(new TemporaryRepoWorkspaceSession(repoRoot)),
      onReady: onReady(leftBehind as LeftBehind, controlFolder),
      ...getReporterOptions(reporter as Reporter),
      shutdownSignal: (ownership as Ownership) === 'embedded' ? new AbortController().signal : undefined
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
