// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as net from 'node:net';

import type { IDaemonFileIdentity } from './DaemonFileIdentity';
import { ADDRESS_IN_USE, listenOrErrorAsync, toListenTransportError } from './DaemonListenerNet';
import type { INetError } from './DaemonListenerNet';
import type { IDaemonPaths } from './DaemonPaths';
import { reclaimStaleDaemonAsync } from './DaemonReclaim';
import { listenPublishedAsync } from './DaemonSocketPublication';

const FIRST_ATTEMPT: number = 0;
const RECLAIM_ATTEMPT: number = 1;
const WINDOWS_PLATFORM: NodeJS.Platform = 'win32';

/**
 * Binds the listener, reclaiming its path once from a dead daemon. Returns the identity of a POSIX socket;
 * a Windows named pipe has no file and disappears with its server.
 */
export async function listenWithReclaimAsync(
  server: net.Server,
  paths: IDaemonPaths
): Promise<IDaemonFileIdentity | undefined> {
  if (process.platform !== WINDOWS_PLATFORM) return listenPublishedAsync(server, paths);
  await listenPipeWithReclaimAsync(server, paths);
  return undefined;
}

async function listenPipeWithReclaimAsync(server: net.Server, paths: IDaemonPaths): Promise<void> {
  for (let attempt: number = FIRST_ATTEMPT; attempt <= RECLAIM_ATTEMPT; attempt++) {
    const bound: boolean = await tryListenOnceAsync(server, paths, attempt);
    if (bound) {
      return;
    }
  }
}

async function tryListenOnceAsync(
  server: net.Server,
  paths: IDaemonPaths,
  attempt: number
): Promise<boolean> {
  const error: INetError | undefined = await listenOrErrorAsync(server, paths.socketPath);
  return error ? recoverFromListenErrorAsync(error, paths, attempt) : true;
}

async function recoverFromListenErrorAsync(
  error: INetError,
  paths: IDaemonPaths,
  attempt: number
): Promise<boolean> {
  const canReclaim: boolean = error.code === ADDRESS_IN_USE && attempt === FIRST_ATTEMPT;
  if (!canReclaim) {
    throw toListenTransportError(error, paths.socketPath);
  }
  await reclaimStaleDaemonAsync(paths);
  return false;
}
