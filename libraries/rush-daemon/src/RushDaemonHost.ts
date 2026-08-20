// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { realpath } from 'node:fs/promises';

import { DAEMON_PROTOCOL_VERSION } from '@rushstack/rush-daemon-protocol';
import {
  computeDaemonWorkspaceKey,
  DaemonFrameListener,
  resolveDaemonPathsFromProcess
} from '@rushstack/rush-daemon-transport';
import type {
  DaemonFrameConnection,
  IDaemonPaths
} from '@rushstack/rush-daemon-transport';

import { DaemonControlSession } from './DaemonControlSession';

/**
 * Options for starting one workspace daemon host.
 *
 * @beta
 */
export interface IRushDaemonHostOptions {
  /** The daemon implementation version reported by `pong`. */
  readonly daemonVersion: string;
  /** Reports connection-level failures. */
  readonly onError?: (error: Error) => void;
  /** The repository root containing rush.json. */
  readonly repoRoot: string;
  /** The selected Rush version used to isolate the workspace transport. */
  readonly rushVersion: string;
  /** Additional stable options that distinguish daemon instances. */
  readonly startupOptions?: Readonly<Record<string, unknown>>;
}

/**
 * A bound, workspace-keyed Rush daemon host.
 *
 * @beta
 */
export class RushDaemonHost {
  readonly #listener: DaemonFrameListener;
  readonly #sessions: Set<DaemonControlSession>;
  readonly #lifecycle: { closing: boolean };
  public readonly paths: IDaemonPaths;
  #closePromise: Promise<void> | undefined;

  private constructor(
    listener: DaemonFrameListener,
    paths: IDaemonPaths,
    sessions: Set<DaemonControlSession>,
    lifecycle: { closing: boolean }
  ) {
    this.#listener = listener;
    this.paths = paths;
    this.#sessions = sessions;
    this.#lifecycle = lifecycle;
  }

  /** Resolves only after the transport is bound and its lockfile has been written. */
  public static async startAsync(options: IRushDaemonHostOptions): Promise<RushDaemonHost> {
    const canonicalRepoRoot: string = await realpath(options.repoRoot);
    const workspaceKey: string = computeDaemonWorkspaceKey({
      canonicalRepoRoot,
      rushVersion: options.rushVersion,
      startupOptions: options.startupOptions
    });
    const paths: IDaemonPaths = resolveDaemonPathsFromProcess(workspaceKey);
    const sessions: Set<DaemonControlSession> = new Set();
    const lifecycle: { closing: boolean } = { closing: false };
    const startedAtMs: number = Date.now();
    const listener: DaemonFrameListener = await DaemonFrameListener.listenAsync(paths, {
      protocolVersion: DAEMON_PROTOCOL_VERSION,
      startedAt: new Date(startedAtMs).toISOString(),
      onConnection: (connection: DaemonFrameConnection) => {
        const session: DaemonControlSession = new DaemonControlSession(connection, {
          daemonVersion: options.daemonVersion,
          startedAtMs,
          onClosed: (closedSession: DaemonControlSession, error: Error | undefined) => {
            sessions.delete(closedSession);
            if (error) {
              options.onError?.(error);
            }
          },
          onError: (error: Error) => options.onError?.(error)
        });
        sessions.add(session);
        if (lifecycle.closing) {
          void session.closeAsync();
        }
      }
    });
    return new RushDaemonHost(listener, paths, sessions, lifecycle);
  }

  /** Closes active connections, stops listening, and removes transport artifacts. */
  public closeAsync(): Promise<void> {
    this.#closePromise ??= this.#closeOnceAsync();
    return this.#closePromise;
  }

  async #closeOnceAsync(): Promise<void> {
    this.#lifecycle.closing = true;
    await Promise.all(Array.from(this.#sessions, (session: DaemonControlSession) => session.closeAsync()));
    await this.#listener.closeAsync();
  }
}
