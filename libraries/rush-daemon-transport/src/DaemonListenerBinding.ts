// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as net from 'node:net';

import { ADDRESS_IN_USE, listenOrErrorAsync, toListenTransportError } from './DaemonListenerNet';
import type { INetError } from './DaemonListenerNet';
import type { IDaemonPaths } from './DaemonPaths';
import { reclaimStaleDaemonAsync } from './DaemonReclaim';

const FIRST_ATTEMPT: number = 0;
const RECLAIM_ATTEMPT: number = 1;

export async function listenWithReclaimAsync(server: net.Server, paths: IDaemonPaths): Promise<void> {
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
