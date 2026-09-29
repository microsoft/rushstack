// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { DAEMON_PROTOCOL_VERSION } from '@rushstack/rush-daemon-protocol';

import { DaemonFrameListener } from '../DaemonListener';
import type { IDaemonPaths } from '../DaemonPaths';
import * as daemonReclaim from '../DaemonReclaim';
import type { IDaemonOrphanReap } from '../DaemonReclaimOptions';

import { createTestDaemonPaths } from './TestDaemonFixture';

const posixIt: jest.It = process.platform === 'win32' ? it.skip : it;
const DIR_MODE: number = 0o700;
const STALE_SOCKET: string = 'stale';

afterEach(() => {
  jest.restoreAllMocks();
});

/** Leaves a file at the socket path, which makes binding reclaim the path. */
function plantStaleSocket(paths: IDaemonPaths): void {
  fs.mkdirSync(path.dirname(paths.socketPath), { recursive: true, mode: DIR_MODE });
  fs.writeFileSync(paths.socketPath, STALE_SOCKET);
}

async function passesOnlyOnOrphansReapedAsync(): Promise<void> {
  const paths: IDaemonPaths = createTestDaemonPaths();
  plantStaleSocket(paths);
  // The reclaim is stubbed: it only removes the stale socket, so that the second attempt to publish succeeds.
  const reclaim: jest.SpyInstance = jest
    .spyOn(daemonReclaim, 'reclaimStaleDaemonAsync')
    .mockImplementation(async (stalePaths: IDaemonPaths) => fs.unlinkSync(stalePaths.socketPath));
  const onOrphansReaped: (reap: IDaemonOrphanReap) => void = () => undefined;
  const listener: DaemonFrameListener = await DaemonFrameListener.listenAsync(paths, {
    protocolVersion: DAEMON_PROTOCOL_VERSION,
    onConnection: () => undefined,
    onOrphansReaped
  });
  await listener.closeAsync();
  // The reaper behind the reclaim also reads fields for tests from its options: nothing else may reach it.
  expect(reclaim.mock.calls).toEqual([[paths, { onOrphansReaped }]]);
}

posixIt(
  'passes only onOrphansReaped from its options on to the reclaim of a stale socket',
  passesOnlyOnOrphansReapedAsync
);
