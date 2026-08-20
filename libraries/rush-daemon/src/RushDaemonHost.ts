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
import { WorkspaceSession } from './WorkspaceSession';
import type { IWorkspaceSession, WorkspaceSessionFactory } from './WorkspaceSession';
import { WorkspaceSessionProvider } from './WorkspaceSessionProvider';

/**
 * Options for starting one workspace daemon host.
 *
 * @beta
 */
export interface IRushDaemonHostOptions {
  /** Overrides workspace session construction for engine integration or testing. */
  readonly createWorkspaceSessionAsync?: WorkspaceSessionFactory;
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
  private readonly _listener: DaemonFrameListener;
  private readonly _sessions: Set<DaemonControlSession>;
  private readonly _workspaceSessionProvider: WorkspaceSessionProvider;
  private readonly _lifecycle: { closing: boolean };
  public readonly paths: IDaemonPaths;
  private _closePromise: Promise<void> | undefined;

  private constructor(
    listener: DaemonFrameListener,
    paths: IDaemonPaths,
    sessions: Set<DaemonControlSession>,
    lifecycle: { closing: boolean },
    workspaceSessionProvider: WorkspaceSessionProvider
  ) {
    this._listener = listener;
    this.paths = paths;
    this._sessions = sessions;
    this._lifecycle = lifecycle;
    this._workspaceSessionProvider = workspaceSessionProvider;
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
    const workspaceSessionProvider: WorkspaceSessionProvider = new WorkspaceSessionProvider(
      options.createWorkspaceSessionAsync ?? WorkspaceSession.createAsync,
      {
        onError: options.onError,
        repoRoot: canonicalRepoRoot,
        rushVersion: options.rushVersion
      }
    );
    const startedAtMs: number = Date.now();
    await workspaceSessionProvider.getSessionAsync();
    let listener: DaemonFrameListener;
    try {
      listener = await DaemonFrameListener.listenAsync(paths, {
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
    } catch (error) {
      try {
        await workspaceSessionProvider[Symbol.asyncDispose]();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'Failed to bind the daemon listener and dispose its workspace session.'
        );
      }
      throw error;
    }
    return new RushDaemonHost(
      listener,
      paths,
      sessions,
      lifecycle,
      workspaceSessionProvider
    );
  }

  /** Returns the single warm workspace session owned by this host. */
  public getWorkspaceSessionAsync(): Promise<IWorkspaceSession> {
    return this._workspaceSessionProvider.getSessionAsync();
  }

  /** Closes active connections, stops listening, and removes transport artifacts. */
  public closeAsync(): Promise<void> {
    this._closePromise ??= this._closeOnceAsync();
    return this._closePromise;
  }

  private async _closeOnceAsync(): Promise<void> {
    this._lifecycle.closing = true;
    const errors: unknown[] = [];
    try {
      await Promise.all(
        Array.from(this._sessions, (session: DaemonControlSession) => session.closeAsync())
      );
    } catch (error) {
      errors.push(error);
    }
    try {
      await this._listener.closeAsync();
    } catch (error) {
      errors.push(error);
    }
    try {
      await this._workspaceSessionProvider[Symbol.asyncDispose]();
    } catch (error) {
      errors.push(error);
    }

    if (errors.length === 1) {
      throw errors[0];
    } else if (errors.length > 1) {
      throw new AggregateError(errors, 'Failed to close Rush daemon host resources.');
    }
  }
}
