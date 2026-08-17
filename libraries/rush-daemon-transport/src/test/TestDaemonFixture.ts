// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'node:os';

import { DAEMON_PROTOCOL_VERSION } from '@rushstack/rush-daemon-protocol';

import { connectDaemonAsync } from '../DaemonConnector';
import type { DaemonFrameConnection } from '../DaemonFrameConnection';
import { DaemonFrameListener } from '../DaemonListener';
import type { IDaemonPaths } from '../DaemonPaths';
import { resolveDaemonPaths } from '../DaemonPaths';

let testKeyCounter: number = 0;
const COUNTER_START: number = 1;

/** Creates unique daemon paths for the current platform in the temp dir. */
export function createTestDaemonPaths(): IDaemonPaths {
  testKeyCounter += COUNTER_START;
  const workspaceKey: string = `rushd-test-${process.pid}-${testKeyCounter}`;
  return resolveDaemonPaths(
    { platform: process.platform, env: {}, tmpdir: os.tmpdir(), uid: process.getuid?.() },
    workspaceKey
  );
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
