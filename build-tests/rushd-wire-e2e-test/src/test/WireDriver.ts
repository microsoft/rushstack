// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Drives a recorded frame stream through a real socket/pipe transport pair.

import * as os from 'node:os';

import { DAEMON_PROTOCOL_VERSION } from '@rushstack/rush-daemon-protocol';
import type { IDaemonFrame } from '@rushstack/rush-daemon-protocol';
import { DaemonFrameListener, connectDaemonAsync, resolveDaemonPaths } from '@rushstack/rush-daemon-transport';
import type { DaemonFrameConnection, IDaemonPaths } from '@rushstack/rush-daemon-transport';

let pathCounter: number = 0;
const COUNTER_STEP: number = 1;

function createE2EPaths(): IDaemonPaths {
  pathCounter += COUNTER_STEP;
  return resolveDaemonPaths(
    { platform: process.platform, env: {}, tmpdir: os.tmpdir(), uid: process.getuid?.() },
    `rushd-e2e-${process.pid}-${pathCounter}`
  );
}

async function writeAllAsync(connection: DaemonFrameConnection, frames: readonly IDaemonFrame[]): Promise<void> {
  for (const frame of frames) {
    await connection.sendFrameAsync(frame);
  }
  await connection.closeAsync();
}

/**
 * Sends `frames` through a real listener/connector pair, invoking
 * `handleFrame` for each decoded frame on the client side, in wire order.
 * Resolves after the server closes the connection and the client drains.
 */
export async function replayFramesOverSocketAsync(
  frames: readonly IDaemonFrame[],
  handleFrame: (frame: IDaemonFrame) => void
): Promise<void> {
  const paths: IDaemonPaths = createE2EPaths();
  const listener: DaemonFrameListener = await DaemonFrameListener.listenAsync(paths, {
    protocolVersion: DAEMON_PROTOCOL_VERSION,
    onConnection: (connection: DaemonFrameConnection) => {
      void writeAllAsync(connection, frames);
    }
  });
  const client: DaemonFrameConnection = await connectDaemonAsync(paths.socketPath);
  try {
    client.onFrame(handleFrame);
    await new Promise<void>((resolve: () => void) => client.onClosed(() => resolve()));
  } finally {
    await client.closeAsync();
    await listener.closeAsync();
  }
}
