// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';

import { LockFile } from '@rushstack/node-core-library';
import type { IDaemonPaths } from '@rushstack/rush-daemon-transport';

export interface IStartupLock {
  releaseAsync(): Promise<void>;
}

export async function tryAcquireStartupLockAsync(paths: IDaemonPaths): Promise<IStartupLock | undefined> {
  const folder: string = path.dirname(paths.lockfilePath);
  if (process.platform !== 'win32') {
    const lock: LockFile | undefined = LockFile.tryAcquire(
      folder,
      `${path.basename(paths.lockfilePath)}-start`
    );
    return lock ? { releaseAsync: async () => lock.release() } : undefined;
  }

  // Windows wx files are exclusively created, not exclusively held: another process can unlink them.
  // An exclusive pipe binding is released by the OS when its owner exits, without inspecting a PID.
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  const server: net.Server = net.createServer((socket) => socket.destroy());
  return await new Promise<IStartupLock | undefined>((resolve, reject) => {
    function onError(error: NodeJS.ErrnoException): void {
      if (error.code === 'EADDRINUSE') resolve(undefined);
      else reject(error);
    }
    server.once('error', onError);
    server.listen(`${paths.socketPath}-startup`, () => {
      server.off('error', onError);
      resolve({
        releaseAsync: () => closeServerAsync(server)
      });
    });
  });
}

function closeServerAsync(server: net.Server): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
