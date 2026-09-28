// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import type * as net from 'node:net';
import * as path from 'node:path';

import type { IDaemonFileIdentity } from './DaemonFileIdentity';
import { listenOrErrorAsync, toListenTransportError } from './DaemonListenerNet';
import type { INetError } from './DaemonListenerNet';
import type { IDaemonPaths } from './DaemonPaths';
import { reclaimStaleDaemonAsync } from './DaemonReclaim';
import { DaemonTransportError, DaemonTransportErrorCode } from './DaemonTransportError';

const PRIVATE_NAME_PREFIX: string = '.bind-';
const PRIVATE_NAME_SEPARATOR: string = '-';
const PRIVATE_NAME_RANDOM_BYTES: number = 4;
const HEX: BufferEncoding = 'hex';
const SOCKET_MODE: number = 0o600;
const ALREADY_EXISTS: string = 'EEXIST';

function getPrivateSocketPath(socketPath: string): string {
  const suffix: string = crypto.randomBytes(PRIVATE_NAME_RANDOM_BYTES).toString(HEX);
  const name: string = `${PRIVATE_NAME_PREFIX}${process.pid}${PRIVATE_NAME_SEPARATOR}${suffix}`;
  return path.join(path.dirname(socketPath), name);
}

function closeServerAsync(server: net.Server): Promise<void> {
  return new Promise<void>((resolve: () => void) => server.close(() => resolve()));
}

/** Gives the private socket the name `socketPath`; `false` when that name exists (link(2) never replaces). */
function tryLink(privatePath: string, socketPath: string): boolean {
  try {
    fs.linkSync(privatePath, socketPath);
    return true;
  } catch (error) {
    if ((error as INetError).code !== ALREADY_EXISTS) throw error;
    return false;
  }
}

function stillInUse(socketPath: string): DaemonTransportError {
  return new DaemonTransportError(
    DaemonTransportErrorCode.daemonAlreadyRunning,
    `The daemon path ${socketPath} is still in use after reclaim.`
  );
}

async function publishAsync(privatePath: string, paths: IDaemonPaths): Promise<IDaemonFileIdentity> {
  fs.chmodSync(privatePath, SOCKET_MODE);
  const { dev, ino } = fs.lstatSync(privatePath);
  if (!tryLink(privatePath, paths.socketPath)) {
    // Reclaim a dead daemon's leftovers once (this throws while their owner lives), then try again.
    await reclaimStaleDaemonAsync(paths);
    if (!tryLink(privatePath, paths.socketPath)) throw stillInUse(paths.socketPath);
  }
  return { dev, ino };
}

/**
 * Binds a POSIX socket under a private name and then publishes it at `paths.socketPath`.
 *
 * @remarks
 * When a server closes, libuv unlinks the path it bound, whichever file has that name by then. The published
 * name may by then belong to a successor (after someone deleted this daemon's socket and another daemon
 * started), so only the private name is ever bound, and it is deleted as soon as the socket is published.
 * Publishing uses link(2), which, unlike bind or rename, never replaces an existing name. The socket is made
 * owner-only before it is published. Returns the identity of the published socket; the listening socket keeps
 * its inode in use, so the identity needs no open descriptor.
 */
export async function listenPublishedAsync(
  server: net.Server,
  paths: IDaemonPaths
): Promise<IDaemonFileIdentity> {
  const privatePath: string = getPrivateSocketPath(paths.socketPath);
  const error: INetError | undefined = await listenOrErrorAsync(server, privatePath);
  if (error) throw toListenTransportError(error, privatePath);
  try {
    return await publishAsync(privatePath, paths);
  } catch (publishError) {
    await closeServerAsync(server);
    throw publishError;
  } finally {
    fs.rmSync(privatePath, { force: true });
  }
}
