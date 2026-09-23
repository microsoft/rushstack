// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { realpath } from 'node:fs/promises';

import { connectOrStartDaemonAsync, type DaemonClient } from '@rushstack/rush-client-core';
import { DAEMON_PROTOCOL_VERSION } from '@rushstack/rush-daemon-protocol';
import type { IDaemonWorkspaceStatus } from '@rushstack/rush-daemon-protocol';
import {
  computeDaemonWorkspaceKey,
  DaemonFrameListener,
  resolveDaemonPathsFromProcess
} from '@rushstack/rush-daemon-transport';
import type { DaemonFrameConnection, IDaemonPaths } from '@rushstack/rush-daemon-transport';

import { DaemonControlSession } from './DaemonControlSession';
import { DaemonIdleTimer } from './DaemonIdleTimer';
import type { IDaemonInteractiveConnection } from './DaemonInteractiveConnection';
import { DaemonRequestDispatcher } from './DaemonRequestDispatcher';
import type { IDaemonRequestResolver } from './DaemonRequestDispatcher';
import { WorkspaceSession } from './WorkspaceSession';
import type { IWorkspaceSession, WorkspaceSessionFactory } from './WorkspaceSession';
import { WorkspaceSessionProvider } from './WorkspaceSessionProvider';
import { getWorkspaceStatus } from './WorkspaceStatus';
import { WorkspaceRequestLifecycle } from './WorkspaceRequestLifecycle';
import type {
  GetWorkspaceSuccessorLaunchAsync,
  IWorkspaceProcessRestartPlan,
  IWorkspaceProcessRestartResult
} from './WorkspaceProcessRestart';

/**
 * Options for starting one workspace daemon host.
 *
 * @beta
 */
export interface IRushDaemonHostOptions {
  /** Selects an available successor before a hard transition; startup still waits for complete old ownership release. */
  readonly getSuccessorLaunchAsync?: GetWorkspaceSuccessorLaunchAsync;
  /** Overrides workspace session construction for engine integration or testing. */
  readonly createWorkspaceSessionAsync?: WorkspaceSessionFactory;
  /** The daemon implementation version reported by `pong`. */
  readonly daemonVersion: string;
  /** Shuts down after this many seconds without pending requests. Disabled when omitted. */
  readonly idleTimeoutSeconds?: number;
  /** Reports connection-level failures. */
  readonly onError?: (error: Error) => void;
  /** Resolves validated wire envelopes into existing typed phased or global requests. */
  readonly requestResolver?: IDaemonRequestResolver;
  /** Receives the request-scoped interactive broker owned by each accepted connection. */
  readonly onInteractiveConnection?: (connection: IDaemonInteractiveConnection) => void;
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
  readonly #idleTimer: DaemonIdleTimer;
  readonly #sessions: Set<DaemonControlSession>;
  readonly #workspaceSessionProvider: WorkspaceSessionProvider;
  readonly #readWorkspaceStatus: () => IDaemonWorkspaceStatus;
  readonly #lifecycle: { closing: boolean };
  readonly #requestDispatcher: DaemonRequestDispatcher;
  public readonly paths: IDaemonPaths;
  #closePromise: Promise<void> | undefined;
  #notifyClosed: (() => void) | undefined;
  readonly #options: IRushDaemonHostOptions;
  readonly #startedAt: string;
  #restartPromise: Promise<IWorkspaceProcessRestartResult> | undefined;
  #resolveRestart: ((result: IWorkspaceProcessRestartResult | undefined) => void) | undefined;
  #rejectRestart: ((error: Error) => void) | undefined;
  /** Settles after an accepted restart reaches a new ready process, or normal shutdown finishes without restarting. */
  public readonly restartCompleted: Promise<IWorkspaceProcessRestartResult | undefined>;

  /** Resolves after shutdown cleanup finishes. Use closeAsync() to observe cleanup failures. */
  public readonly closed: Promise<void>;

  private constructor(
    listener: DaemonFrameListener,
    paths: IDaemonPaths,
    sessions: Set<DaemonControlSession>,
    lifecycle: { closing: boolean },
    requestDispatcher: DaemonRequestDispatcher,
    workspaceSessionProvider: WorkspaceSessionProvider,
    idleTimer: DaemonIdleTimer,
    options: IRushDaemonHostOptions,
    startedAt: string,
    readWorkspaceStatus: () => IDaemonWorkspaceStatus
  ) {
    this.closed = new Promise<void>((resolve) => {
      this.#notifyClosed = resolve;
    });
    this.#listener = listener;
    this.paths = paths;
    this.#sessions = sessions;
    this.#lifecycle = lifecycle;
    this.#requestDispatcher = requestDispatcher;
    this.#workspaceSessionProvider = workspaceSessionProvider;
    this.#readWorkspaceStatus = readWorkspaceStatus;
    this.#idleTimer = idleTimer;
    this.#options = options;
    this.#startedAt = startedAt;
    this.restartCompleted = new Promise((resolve, reject) => {
      this.#resolveRestart = resolve;
      this.#rejectRestart = reject;
    });
    void this.restartCompleted.catch(() => undefined);
  }

  /** Resolves only after the transport is bound and its lockfile has been written. */
  public static async startAsync(options: IRushDaemonHostOptions): Promise<RushDaemonHost> {
    const idleTimer: DaemonIdleTimer = new DaemonIdleTimer(options.idleTimeoutSeconds);
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
    const workspaceSession: IWorkspaceSession = await workspaceSessionProvider.getSessionAsync();
    let requestLifecycle: WorkspaceRequestLifecycle | undefined;
    try {
      if (options.requestResolver?.workspaceLifecycle) {
        requestLifecycle = await WorkspaceRequestLifecycle.createAsync({
          provider: workspaceSessionProvider,
          resolver: options.requestResolver,
          rushVersion: options.rushVersion,
          getSuccessorLaunchAsync: options.getSuccessorLaunchAsync,
          onRestartRequested: requestRestart
        });
      }
    } catch (error) {
      await workspaceSessionProvider[Symbol.asyncDispose]();
      throw error;
    }
    const readWorkspaceStatus = (): IDaemonWorkspaceStatus =>
      getWorkspaceStatus(workspaceSessionProvider, requestLifecycle?.lastReloadTier ?? 0);
    const requestDispatcher: DaemonRequestDispatcher = new DaemonRequestDispatcher(
      workspaceSession,
      options.requestResolver,
      requestLifecycle
    );
    let listener: DaemonFrameListener;
    try {
      listener = await DaemonFrameListener.listenAsync(paths, {
        protocolVersion: DAEMON_PROTOCOL_VERSION,
        startedAt: new Date(startedAtMs).toISOString(),
        onConnection: (connection: DaemonFrameConnection) => {
          const session: DaemonControlSession = new DaemonControlSession(connection, {
            daemonVersion: options.daemonVersion,
            dispatcher: requestDispatcher,
            startedAtMs,
            getWorkspaceStatus: readWorkspaceStatus,
            onInteractiveConnection: options.onInteractiveConnection,
            onClosed: (closedSession: DaemonControlSession, error: Error | undefined) => {
              sessions.delete(closedSession);
              if (error) {
                options.onError?.(error);
              }
            },
            onError: (error: Error) => options.onError?.(error),
            onRequestStarted: () => idleTimer.acquire(),
            onShutdownRequested: requestShutdown
          });
          sessions.add(session);
          if (lifecycle.closing) {
            void session.closeAsync();
          }
        }
      });
    } catch (error) {
      const cleanupErrors: unknown[] = [];
      try {
        await requestDispatcher[Symbol.asyncDispose]();
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
      try {
        await workspaceSessionProvider[Symbol.asyncDispose]();
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          [error, ...cleanupErrors],
          'Failed to bind the daemon listener and dispose its workspace session.'
        );
      }
      throw error;
    }
    const host: RushDaemonHost = new RushDaemonHost(
      listener,
      paths,
      sessions,
      lifecycle,
      requestDispatcher,
      workspaceSessionProvider,
      idleTimer,
      options,
      new Date(startedAtMs).toISOString(),
      readWorkspaceStatus
    );
    function requestRestart(plan: IWorkspaceProcessRestartPlan): void {
      host.#requestRestart(plan);
    }
    function requestShutdown(): void {
      void host.closeAsync().catch((error: Error) => {
        if (options.onError) options.onError(error);
        else process.emitWarning(error);
      });
    }
    idleTimer.start(requestShutdown);
    return host;
  }

  /** Returns the single warm workspace session owned by this host. */
  public getWorkspaceSessionAsync(): Promise<IWorkspaceSession> {
    return this.#workspaceSessionProvider.getSessionAsync();
  }

  /** Host-local generation, useful for rejecting retained server-side references. */
  public get workspaceGeneration(): number {
    return this.#workspaceSessionProvider.generation;
  }

  /** Samples the installed generation without constructing a session or graph or taking request leases. */
  public get workspaceStatus(): IDaemonWorkspaceStatus {
    return this.#readWorkspaceStatus();
  }

  /** Closes active connections, stops listening, and removes transport artifacts. */
  public closeAsync(): Promise<void> {
    this.#closePromise ??= this.#closeOnceAsync().finally(() => {
      this.#notifyClosed?.();
      if (!this.#restartPromise) this.#resolveRestart?.(undefined);
    });
    return this.#closePromise;
  }

  #requestRestart(plan: IWorkspaceProcessRestartPlan): void {
    if (this.#restartPromise || this.#closePromise) return;
    this.#restartPromise = Promise.resolve().then(() => this.#restartOnceAsync(plan));
    void this.#restartPromise.then(
      (result) => this.#resolveRestart?.(result),
      (error: unknown) => {
        const failure: Error = error instanceof Error ? error : new Error(String(error));
        this.#rejectRestart?.(failure);
        if (this.#options.onError) this.#options.onError(failure);
        else process.emitWarning(failure);
      }
    );
  }

  async #restartOnceAsync(plan: IWorkspaceProcessRestartPlan): Promise<IWorkspaceProcessRestartResult> {
    await this.closeAsync();
    if (plan.failure) throw plan.failure;
    if (!plan.launch) throw new Error('A successor was not selected.');
    const paths: IDaemonPaths = resolveDaemonPathsFromProcess(
      computeDaemonWorkspaceKey({
        canonicalRepoRoot: plan.repoRoot,
        rushVersion: plan.rushVersion,
        startupOptions: this.#options.startupOptions
      })
    );
    const client: DaemonClient = await connectOrStartDaemonAsync({
      paths,
      expectedDaemonVersion: plan.launch.daemonVersion,
      startCommand: plan.launch.startCommand,
      previousDaemon: { pid: process.pid, startedAt: this.#startedAt }
    });
    try {
      const { pid } = await client.status;
      if (!pid || pid === process.pid) throw new Error('A process restart must attest a new daemon PID.');
      return { pid, rushVersion: plan.rushVersion };
    } finally {
      await client.closeAsync();
    }
  }

  async #closeOnceAsync(): Promise<void> {
    this.#idleTimer[Symbol.dispose]();
    this.#lifecycle.closing = true;
    const errors: unknown[] = [];
    // Refuse new sessions but keep the listener's live ownership until every resource join succeeds.
    // A failed standalone host must not exit naturally and become reclaimable over unjoined children.
    const sessionSettlements: PromiseSettledResult<void>[] = await Promise.allSettled(
      Array.from(this.#sessions, (session: DaemonControlSession) =>
        session.closeAsync(!!this.#restartPromise)
      )
    );
    for (const settlement of sessionSettlements) {
      if (settlement.status === 'rejected') {
        errors.push(settlement.reason);
      }
    }
    try {
      const workspace: IWorkspaceSession = await this.#workspaceSessionProvider.getSessionAsync();
      await workspace.quiesceWarmSetAsync?.();
    } catch (error) {
      throw new AggregateError([...errors, error], 'Could not quiesce workspace maintenance for shutdown.');
    }
    try {
      await this.#requestDispatcher[Symbol.asyncDispose]();
    } catch (error) {
      errors.push(error);
    }
    try {
      await this.#workspaceSessionProvider[Symbol.asyncDispose]();
    } catch (error) {
      errors.push(error);
    }

    if (errors.length === 0) {
      try {
        await this.#listener.closeAsync();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) {
      throw errors[0];
    } else if (errors.length > 1) {
      throw new AggregateError(errors, 'Failed to close Rush daemon host resources.');
    }
  }
}
