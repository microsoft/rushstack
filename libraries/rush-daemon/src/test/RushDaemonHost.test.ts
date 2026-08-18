// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  DAEMON_PROTOCOL_VERSION,
  DaemonFrameType,
  createDaemonHello,
  decodeDaemonControlMessage,
  encodeDaemonControlMessage
} from '@rushstack/rush-daemon-protocol';
import type {
  DaemonControlMessage,
  IDaemonFrame
} from '@rushstack/rush-daemon-protocol';
import {
  connectDaemonAsync,
  readDaemonLockfile
} from '@rushstack/rush-daemon-transport';
import type {
  DaemonFrameConnection,
  IDaemonPaths
} from '@rushstack/rush-daemon-transport';

import { RushDaemonHost } from '../RushDaemonHost';
import { serveRushDaemonAsync } from '../serveRushDaemon';

const RUSH_VERSION: string = '5.178.1';
const DAEMON_VERSION: string = '0.1.0-test';
const WINDOWS_PIPE_PREFIX: string = '\\\\.\\pipe\\rushd-';
const REPO_PREFIX: string = 'rush-daemon-host-test-';

const testRepoRoots: Set<string> = new Set();

afterEach(() => {
  for (const repoRoot of testRepoRoots) {
    fs.rmSync(repoRoot, { force: true, recursive: true });
  }
  testRepoRoots.clear();
});

function createTestRepoRoot(): string {
  const repoRoot: string = fs.mkdtempSync(path.join(os.tmpdir(), REPO_PREFIX));
  testRepoRoots.add(repoRoot);
  return repoRoot;
}

function createHostOptions(repoRoot: string): {
  daemonVersion: string;
  repoRoot: string;
  rushVersion: string;
} {
  return { daemonVersion: DAEMON_VERSION, repoRoot, rushVersion: RUSH_VERSION };
}

async function exchangeControlAsync(
  connection: DaemonFrameConnection,
  message: DaemonControlMessage
): Promise<DaemonControlMessage> {
  const response: Promise<DaemonControlMessage> = new Promise(
    (resolve: (message: DaemonControlMessage) => void) => {
      connection.onFrame((frame: IDaemonFrame) => resolve(decodeDaemonControlMessage(frame.payload)));
    }
  );
  await connection.sendFrameAsync({
    kind: DaemonFrameType.controlJson,
    payload: encodeDaemonControlMessage(message)
  });
  return response;
}

describe(RushDaemonHost.name, () => {
  it('binds the workspace transport and handles hello plus ping', async () => {
    const host: RushDaemonHost = await RushDaemonHost.startAsync(
      createHostOptions(createTestRepoRoot())
    );
    const client: DaemonFrameConnection = await connectDaemonAsync(host.paths.socketPath);
    try {
      expect(readDaemonLockfile(host.paths.lockfilePath)).toMatchObject({
        pid: process.pid,
        protocolVersion: DAEMON_PROTOCOL_VERSION,
        socketPath: host.paths.socketPath
      });
      if (process.platform === 'win32') {
        expect(host.paths.socketPath.startsWith(WINDOWS_PIPE_PREFIX)).toBe(true);
      }
      const helloAck: DaemonControlMessage = await exchangeControlAsync(
        client,
        createDaemonHello(DAEMON_PROTOCOL_VERSION)
      );
      expect(helloAck).toMatchObject({
        kind: 'helloAck',
        payload: { protocolVersion: DAEMON_PROTOCOL_VERSION }
      });
      const pong: DaemonControlMessage = await exchangeControlAsync(client, {
        kind: 'ping',
        payload: {}
      });
      expect(pong).toMatchObject({
        kind: 'pong',
        payload: {
          daemonVersion: DAEMON_VERSION,
          protocolVersion: DAEMON_PROTOCOL_VERSION
        }
      });
    } finally {
      await client.closeAsync();
      await host.closeAsync();
    }
  });

  it('signals readiness only after the listener and lockfile are available', async () => {
    const controller: AbortController = new AbortController();
    let readyPaths: IDaemonPaths | undefined;
    const onReadyAsync: (host: RushDaemonHost) => Promise<void> = async (host: RushDaemonHost) => {
      readyPaths = host.paths;
      expect(readDaemonLockfile(host.paths.lockfilePath)).toBeDefined();
      const client: DaemonFrameConnection = await connectDaemonAsync(host.paths.socketPath);
      await client.closeAsync();
      controller.abort();
    };
    await serveRushDaemonAsync({
      ...createHostOptions(createTestRepoRoot()),
      shutdownSignal: controller.signal,
      onReady: onReadyAsync
    });
    if (!readyPaths) {
      throw new Error('The daemon did not signal readiness.');
    }
    expect(readDaemonLockfile(readyPaths.lockfilePath)).toBeUndefined();
  });

  it('closes active connections and removes transport artifacts', async () => {
    const host: RushDaemonHost = await RushDaemonHost.startAsync(
      createHostOptions(createTestRepoRoot())
    );
    const client: DaemonFrameConnection = await connectDaemonAsync(host.paths.socketPath);
    const closed: Promise<void> = new Promise((resolve: () => void) => client.onClosed(() => resolve()));
    await host.closeAsync();
    await closed;
    expect(readDaemonLockfile(host.paths.lockfilePath)).toBeUndefined();
    await expect(connectDaemonAsync(host.paths.socketPath)).rejects.toMatchObject({
      code: 'connectionRefused'
    });
  });
});
