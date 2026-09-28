// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { DAEMON_PROTOCOL_VERSION } from '@rushstack/rush-daemon-protocol';

import { connectDaemonAsync } from '../DaemonConnector';
import type { DaemonFrameConnection } from '../DaemonFrameConnection';
import { DaemonFrameListener } from '../DaemonListener';
import type { IDaemonPaths } from '../DaemonPaths';
import { DAEMON_RUNTIME_DIR_ENV_VAR, resolveDaemonPaths } from '../DaemonPaths';

let testKeyCounter: number = 0;
const COUNTER_START: number = 1;
const ISOLATED_BASE_PREFIX: string = 'rushd-test-base-';
// Short, as a socket path must be (104 bytes on macOS); the daemon's own default base is /tmp too.
const POSIX_TEMP_FOLDER: string = '/tmp';

function resolveTestDaemonPaths(env: Readonly<Record<string, string>>): IDaemonPaths {
  testKeyCounter += COUNTER_START;
  const workspaceKey: string = `rushd-test-${process.pid}-${testKeyCounter}`;
  return resolveDaemonPaths(
    { platform: process.platform, env, tmpdir: os.tmpdir(), uid: process.getuid?.() },
    workspaceKey
  );
}

/** Creates unique daemon paths for the current platform in the user's shared runtime directory. */
export function createTestDaemonPaths(): IDaemonPaths {
  return resolveTestDaemonPaths({});
}

/**
 * Creates unique daemon paths in a new runtime base of their own (see {@link removeIsolatedBase}), for tests
 * that delete or replace the runtime directory. Real daemons use the shared one.
 */
export function createIsolatedTestDaemonPaths(): IDaemonPaths {
  const parent: string = process.platform === 'win32' ? os.tmpdir() : POSIX_TEMP_FOLDER;
  const base: string = fs.mkdtempSync(path.join(parent, ISOLATED_BASE_PREFIX));
  return resolveTestDaemonPaths({ [DAEMON_RUNTIME_DIR_ENV_VAR]: base });
}

/** Deletes the runtime base of paths from {@link createIsolatedTestDaemonPaths}. */
export function removeIsolatedBase(paths: IDaemonPaths): void {
  if (paths.runtimeDir !== undefined)
    fs.rmSync(path.dirname(paths.runtimeDir), { recursive: true, force: true });
}

/** A minimal deferred promise for crossing the callback/async boundary. */
export interface IDeferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

/** Creates a {@link IDeferred}. */
export function createDeferred<T>(): IDeferred<T> {
  let resolveFn: ((value: T) => void) | undefined;
  const promise: Promise<T> = new Promise<T>((resolve: (value: T) => void) => {
    resolveFn = resolve;
  });
  return {
    promise,
    resolve: (value: T) => resolveFn?.(value)
  };
}

/** A connected client/server pair over a test listener. */
export interface ITestDaemonPair {
  readonly listener: DaemonFrameListener;
  readonly client: DaemonFrameConnection;
  readonly serverSide: Promise<DaemonFrameConnection>;
}

/** Starts a test listener and connects one client to it. */
export async function startTestDaemonPair(paths: IDaemonPaths): Promise<ITestDaemonPair> {
  const serverReady: IDeferred<DaemonFrameConnection> = createDeferred<DaemonFrameConnection>();
  const listener: DaemonFrameListener = await DaemonFrameListener.listenAsync(paths, {
    protocolVersion: DAEMON_PROTOCOL_VERSION,
    onConnection: (connection: DaemonFrameConnection) => serverReady.resolve(connection)
  });
  const client: DaemonFrameConnection = await connectDaemonAsync(paths.socketPath);
  return { listener, client, serverSide: serverReady.promise };
}
