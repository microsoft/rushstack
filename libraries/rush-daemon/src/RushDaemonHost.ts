// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import { realpath } from 'node:fs/promises';

import type { IOperationGraph } from '@microsoft/rush-lib';
import { DeferredCacheEntryWrites } from '@microsoft/rush-lib/lib/logic/buildCache/DeferredCacheEntryWrites';
import { LockFile } from '@rushstack/node-core-library';
import { connectOrStartDaemonAsync, type DaemonClient } from '@rushstack/rush-client-core';
import { DAEMON_PROTOCOL_VERSION } from '@rushstack/rush-daemon-protocol';
import type { IDaemonWorkspaceStatus } from '@rushstack/rush-daemon-protocol';
import {
  computeDaemonWorkspaceKey,
  DaemonFrameListener,
  resolveDaemonPathsFromProcess
} from '@rushstack/rush-daemon-transport';
import type { DaemonFileChange, DaemonFrameConnection, IDaemonPaths } from '@rushstack/rush-daemon-transport';

import { ConnectingClientTracker } from './ConnectingClientTracker';
import { DaemonControlSession } from './DaemonControlSession';
import type { CheckDaemonInstallation } from './DaemonInstallationMonitor';
import { DaemonIdleGarbageCollector, type IDaemonIdleGarbageCollection } from './DaemonIdleGarbageCollector';
import { DaemonIdleTimer } from './DaemonIdleTimer';
import type { IDaemonInteractiveConnection } from './DaemonInteractiveConnection';
import { getOrphanReapLogOptions } from './DaemonOrphanReapLog';
import { DaemonRequestDispatcher } from './DaemonRequestDispatcher';
import type { IDaemonRequestResolver } from './DaemonRequestDispatcher';
import { DaemonShutdownDeadline } from './DaemonShutdownDeadline';
import { DaemonShutdownDeadlineError, type DaemonShutdownStage } from './DaemonShutdownDeadlineError';
import { DaemonShutdownError, type DaemonShutdownInitiator } from './DaemonShutdownError';
import { DaemonSocketWatch } from './DaemonSocketWatch';
import { getReducingGarbageCollection } from './ReducingGarbageCollection';
import { WorkspaceSession } from './WorkspaceSession';
import type { IWorkspaceSession, WorkspaceSessionFactory } from './WorkspaceSession';
import { WorkspaceSessionProvider } from './WorkspaceSessionProvider';
import { getWorkspaceStatus } from './WorkspaceStatus';
import { WorkspaceRequestLifecycle } from './WorkspaceRequestLifecycle';
import { isGraphBusy } from './WorkspaceWarmSet';
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
  /**
   * After a request, once no request has been pending for this many milliseconds and the operation graph is idle,
   * runs one full garbage collection that returns the freed heap pages to the operating system, and logs what it
   * returned through {@link IRushDaemonHostOptions.onLog}. It runs again only after another request. Without it, the
   * process keeps the resident memory of its busiest recent request until V8 finds it idle by itself, which after
   * some requests doesn't happen. Disabled when omitted, except that {@link serveRushDaemonAsync} defaults it for a
   * daemon that owns its process.
   */
  readonly idleGarbageCollectionDelayMs?: number;
  /**
   * How long {@link RushDaemonHost.closeAsync} waits for shutdown cleanup before it rejects with
   * {@link DaemonShutdownDeadlineError}, so that an await that ignores cancellation cannot keep the daemon from
   * exiting. The cleanup goes on in the background. No deadline when omitted, except that
   * {@link serveRushDaemonAsync} defaults it for a daemon that owns its process.
   */
  readonly shutdownDeadlineMs?: number;
  /** Reports connection-level failures. A client that goes away before its reply is not one (see `onLog`). */
  readonly onError?: (error: Error) => void;
  /**
   * Receives messages for the daemon log: one for each rejected request, with the stack when the failure was
   * unexpected, one for each restart that the clients must finish, one when the daemon's socket was deleted
   * or replaced, one for each reply that could not reach a client because the client went away, one with the
   * process ID and the reason when the host begins to shut down, one for each set of process groups that
   * an exited daemon left running and that startup stopped when it reclaimed the endpoint, and one for each
   * build cache entry that the `deferCacheWrites` setting writes in the background, fails to write or drops.
   * Without it, each such set of process groups is reported as a `RUSH_DAEMON_ORPHANS_REAPED` process warning.
   */
  readonly onLog?: (message: string) => void;
  /**
   * Reports a folder of this daemon's installation that was removed or replaced after startup. Checked before
   * each request: after a change, new and queued requests get a typed restart result, and once running requests
   * finish, the host closes without a successor so that the clients start one. `pong` reports the change.
   * Not checked when omitted.
   */
  readonly checkInstallation?: CheckDaemonInstallation;
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
 * @remarks
 * On POSIX, the host checks every 5 seconds that its socket still has its published name. No client can connect
 * after the socket file was deleted (for example by a cleaner of the temp folder) or its name was taken by
 * another file, and none can start another daemon while this one owns the lockfile. After such a change, the host
 * therefore closes as soon as no request is running, as after an idle timeout, so that the next client starts a
 * new daemon.
 *
 * @beta
 */
export class RushDaemonHost {
  readonly #listener: DaemonFrameListener;
  readonly #idleTimer: DaemonIdleTimer;
  readonly #idleGarbageCollector: DaemonIdleGarbageCollector | undefined;
  #socketWatch: DaemonSocketWatch | undefined;
  readonly #sessions: Set<DaemonControlSession>;
  readonly #workspaceSessionProvider: WorkspaceSessionProvider;
  readonly #readWorkspaceStatus: () => IDaemonWorkspaceStatus;
  readonly #lifecycle: { closing: boolean };
  readonly #requestDispatcher: DaemonRequestDispatcher;
  public readonly paths: IDaemonPaths;
  #closePromise: Promise<void> | undefined;
  #closeStage: DaemonShutdownStage = 'requests';
  #notifyClosed: (() => void) | undefined;
  readonly #shutdownDeadline: DaemonShutdownDeadline;
  readonly #options: IRushDaemonHostOptions;
  readonly #startedAt: string;
  #restartPromise: Promise<IWorkspaceProcessRestartResult | undefined> | undefined;
  #restartPlan: IWorkspaceProcessRestartPlan | undefined;
  #resolveRestart: ((result: IWorkspaceProcessRestartResult | undefined) => void) | undefined;
  #rejectRestart: ((error: Error) => void) | undefined;
  /**
   * Settles after an accepted restart reaches a new ready process, or normal shutdown finishes without restarting.
   * Resolves `undefined` when the installation changed, because the clients start the next process.
   */
  public readonly restartCompleted: Promise<IWorkspaceProcessRestartResult | undefined>;

  /**
   * Resolves after shutdown cleanup finishes, fails, or is cut short by its deadline. Use closeAsync() to observe
   * cleanup failures.
   */
  public readonly closed: Promise<void>;

  private constructor(
    listener: DaemonFrameListener,
    paths: IDaemonPaths,
    sessions: Set<DaemonControlSession>,
    lifecycle: { closing: boolean },
    requestDispatcher: DaemonRequestDispatcher,
    workspaceSessionProvider: WorkspaceSessionProvider,
    idleTimer: DaemonIdleTimer,
    idleGarbageCollector: DaemonIdleGarbageCollector | undefined,
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
    this.#idleGarbageCollector = idleGarbageCollector;
    this.#options = options;
    this.#startedAt = startedAt;
    this.#shutdownDeadline = new DaemonShutdownDeadline({
      timeoutMs: options.shutdownDeadlineMs,
      getProgress: () => ({
        stage: this.#closeStage,
        unfinishedRequests: Array.from(this.#sessions, (session: DaemonControlSession) =>
          session.describeActiveRequests()
        ).flat()
      }),
      onLateFailure: (error: Error) => this.#reportError(error)
    });
    this.restartCompleted = new Promise((resolve, reject) => {
      this.#resolveRestart = resolve;
      this.#rejectRestart = reject;
    });
    void this.restartCompleted.catch(() => undefined);
  }

  /** Resolves only after the transport is bound and its lockfile has been written. */
  public static async startAsync(options: IRushDaemonHostOptions): Promise<RushDaemonHost> {
    const idleTimer: DaemonIdleTimer = new DaemonIdleTimer(options.idleTimeoutSeconds);
    // The `deferCacheWrites` setting writes build cache entries after their operations complete.
    DeferredCacheEntryWrites.instance.setLog(options.onLog);
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
    const idleGarbageCollector: DaemonIdleGarbageCollector | undefined = createIdleGarbageCollector(
      options,
      workspaceSessionProvider
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
          onRestartRequested: requestRestart,
          checkInstallation: options.checkInstallation,
          onLog: options.onLog
        });
      }
    } catch (error) {
      await workspaceSessionProvider[Symbol.asyncDispose]();
      throw error;
    }
    const readWorkspaceStatus = (omitWarmSet: boolean = false): IDaemonWorkspaceStatus =>
      getWorkspaceStatus(workspaceSessionProvider, requestLifecycle?.lastReloadTier ?? 0, omitWarmSet);
    const requestDispatcher: DaemonRequestDispatcher = new DaemonRequestDispatcher(
      workspaceSession,
      options.requestResolver,
      requestLifecycle
    );
    const connectingClients: ConnectingClientTracker = new ConnectingClientTracker();
    let listener: DaemonFrameListener;
    try {
      listener = await DaemonFrameListener.listenAsync(paths, {
        ...getOrphanReapLogOptions(options.onLog),
        protocolVersion: DAEMON_PROTOCOL_VERSION,
        startedAt: new Date(startedAtMs).toISOString(),
        onConnection: (connection: DaemonFrameConnection) => {
          const session: DaemonControlSession = new DaemonControlSession(connection, {
            connectingClients,
            daemonVersion: options.daemonVersion,
            dispatcher: requestDispatcher,
            startedAtMs,
            getWorkspaceStatus: readWorkspaceStatus,
            checkInstallation: options.checkInstallation,
            onLog: options.onLog,
            onInteractiveConnection: options.onInteractiveConnection,
            onClosed: (closedSession: DaemonControlSession, error: Error | undefined) => {
              sessions.delete(closedSession);
              if (error) {
                options.onError?.(error);
              }
            },
            onError: (error: Error) => options.onError?.(error),
            onRequestStarted: () => {
              const releaseIdleTimer: () => void = idleTimer.acquire();
              const releaseIdleGarbageCollector: (() => void) | undefined = idleGarbageCollector?.acquire();
              return () => {
                releaseIdleTimer();
                releaseIdleGarbageCollector?.();
              };
            },
            onShutdownRequested: () => requestShutdown('controlClient'),
            getActiveRequestCount: () => {
              let count: number = 0;
              for (const activeSession of sessions) count += activeSession.activeRequestCount;
              return count;
            }
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
      idleGarbageCollector,
      options,
      new Date(startedAtMs).toISOString(),
      readWorkspaceStatus
    );
    function requestRestart(plan: IWorkspaceProcessRestartPlan): void {
      host.#requestRestart(plan);
    }
    function requestShutdown(initiator: DaemonShutdownInitiator): void {
      void host.closeAsync(new DaemonShutdownError({ initiator })).catch((error: Error) => {
        // The host's owner sees a shutdown cut short through closeAsync(), and decides whether to exit.
        if (!(error instanceof DaemonShutdownDeadlineError)) host.#reportError(error);
      });
    }
    let idleInitiator: DaemonShutdownInitiator = 'idleTimeout';
    idleTimer.start(() => requestShutdown(idleInitiator));
    host.#socketWatch = new DaemonSocketWatch(
      () => listener.checkSocket(),
      (change: DaemonFileChange) => {
        options.onLog?.(
          `rushd: the socket ${paths.socketPath} was ${change}, so no client can connect to this daemon; ` +
            'exiting once running requests finish, so that the next client starts a new daemon'
        );
        idleInitiator = 'socketLost';
        idleTimer.expire();
      }
    );
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

  /**
   * Closes active connections, stops listening, and removes transport artifacts.
   *
   * @remarks
   * Rejects with {@link DaemonShutdownDeadlineError} when the cleanup does not finish within
   * {@link IRushDaemonHostOptions.shutdownDeadlineMs}, or when {@link RushDaemonHost.expireShutdownDeadline} is
   * called first. The listener then keeps its socket and lockfile; see {@link RushDaemonHost.releaseForExit}.
   *
   * @param reason - Delivered to requests that are still running; only the first close call's reason is used.
   */
  public closeAsync(reason?: DaemonShutdownError): Promise<void> {
    this.#closePromise ??= this.#shutdownDeadline.raceAsync(this.#closeOnceAsync(reason)).finally(() => {
      this.#notifyClosed?.();
      if (!this.#restartPromise) this.#resolveRestart?.(undefined);
    });
    return this.#closePromise;
  }

  /**
   * Cuts the shutdown short, for example on a second termination signal: a running or later
   * {@link RushDaemonHost.closeAsync} rejects with {@link DaemonShutdownDeadlineError} at once.
   *
   * @param forcedBy - What cut the shutdown short, such as "a second SIGTERM", for the error message.
   */
  public expireShutdownDeadline(forcedBy: string): void {
    this.#shutdownDeadline.expire(forcedBy);
  }

  /**
   * For a daemon process that exits after its shutdown was cut short: removes the socket, the lockfile and this
   * process's repository lock (`common/temp/rush#<pid>.lock`), unless the daemon still has child processes. Then
   * they all stay, as after a crash, so that the next daemon reaps those processes when it reclaims the socket.
   *
   * @returns Whether they were removed.
   */
  public releaseForExit(): boolean {
    if (!this.#listener.releaseForExit()) return false;
    const session: IWorkspaceSession | undefined = this.#workspaceSessionProvider.currentSession;
    // On Windows the lock is an open handle that the exit releases.
    if (session && process.platform !== 'win32') {
      fs.rmSync(LockFile.getLockFilePath(session.rushConfiguration.commonTempFolder, 'rush'), {
        force: true
      });
    }
    return true;
  }

  #reportError(error: Error): void {
    if (this.#options.onError) this.#options.onError(error);
    else process.emitWarning(error);
  }

  #requestRestart(plan: IWorkspaceProcessRestartPlan): void {
    if (this.#restartPromise || this.#closePromise) return;
    this.#restartPromise = Promise.resolve().then(() => this.#restartOnceAsync(plan));
    void this.#restartPromise.then(
      (result) => this.#resolveRestart?.(result),
      (error: unknown) => {
        const failure: Error = error instanceof Error ? error : new Error(String(error));
        this.#rejectRestart?.(failure);
        this.#reportError(failure);
      }
    );
  }

  async #restartOnceAsync(
    plan: IWorkspaceProcessRestartPlan
  ): Promise<IWorkspaceProcessRestartResult | undefined> {
    this.#restartPlan = plan;
    await this.closeAsync(new DaemonShutdownError({ initiator: 'restart' }));
    if (plan.reason === 'installation-changed') return undefined;
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

  async #closeOnceAsync(reason: DaemonShutdownError | undefined): Promise<void> {
    this.#logShutdown(reason);
    this.#idleTimer[Symbol.dispose]();
    this.#idleGarbageCollector?.[Symbol.dispose]();
    this.#socketWatch?.[Symbol.dispose]();
    this.#lifecycle.closing = true;
    const errors: unknown[] = [];
    // Refuse new sessions but keep the listener's live ownership until every resource join succeeds.
    // A failed standalone host must not exit naturally and become reclaimable over unjoined children.
    this.#closeStage = 'requests';
    const sessionSettlements: PromiseSettledResult<void>[] = await Promise.allSettled(
      Array.from(this.#sessions, (session: DaemonControlSession) =>
        session.closeAsync(!!this.#restartPromise, reason ?? new DaemonShutdownError({ initiator: 'host' }))
      )
    );
    for (const settlement of sessionSettlements) {
      if (settlement.status === 'rejected') {
        errors.push(settlement.reason);
      }
    }
    this.#closeStage = 'workspaceMaintenance';
    try {
      const workspace: IWorkspaceSession = await this.#workspaceSessionProvider.getSessionAsync();
      await workspace.quiesceWarmSetAsync?.();
    } catch (error) {
      throw new AggregateError([...errors, error], 'Could not quiesce workspace maintenance for shutdown.');
    }
    this.#closeStage = 'requestDispatcher';
    try {
      await this.#requestDispatcher[Symbol.asyncDispose]();
    } catch (error) {
      errors.push(error);
    }
    this.#closeStage = 'workspaceSession';
    try {
      await this.#workspaceSessionProvider[Symbol.asyncDispose]();
    } catch (error) {
      errors.push(error);
    }
    // No operation runs now, so no build cache entry is queued. The pending ones are dropped: a stopping daemon
    // must not wait for them, and the entries are only a cache.
    this.#closeStage = 'cacheWrites';
    try {
      await DeferredCacheEntryWrites.instance.abortAsync();
    } catch (error) {
      // Only files in the common temp folder are left behind, so the daemon still releases its listener.
      this.#reportError(error as Error);
    }

    if (errors.length === 0) {
      this.#closeStage = 'listener';
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

  #logShutdown(reason: DaemonShutdownError | undefined): void {
    const description: string = describeShutdown(reason, this.#restartPlan, this.#options.idleTimeoutSeconds);
    try {
      this.#options.onLog?.(`rushd (PID ${process.pid}) shutting down: ${description}`);
    } catch {
      // An onLog callback that throws must not keep the daemon from shutting down.
    }
  }
}

function describeShutdown(
  reason: DaemonShutdownError | undefined,
  restartPlan: IWorkspaceProcessRestartPlan | undefined,
  idleTimeoutSeconds: number | undefined
): string {
  switch (reason?.initiator) {
    case 'signal':
      return `received ${reason?.signal ?? 'a termination signal'}`;
    case 'controlClient':
      return 'requested by a client ("rush-client daemon stop" or "daemon restart")';
    case 'idleTimeout':
      return idleTimeoutSeconds === undefined ? 'idle timeout' : `idle for ${idleTimeoutSeconds} s`;
    case 'restart':
      switch (restartPlan?.reason) {
        case 'hard-input-change':
          return `restarting for Rush ${restartPlan.rushVersion}, because a request needs a new process`;
        case 'native-mutation':
          return `restarting for Rush ${restartPlan.rushVersion} after "rush install" or "rush update"`;
        case 'installation-changed':
          return 'its installation changed, so the next client starts a new daemon';
        default:
          return 'restarting';
      }
    case 'socketLost':
      return 'its socket file was deleted or replaced, so the next client starts a new daemon';
    default:
      return 'the daemon host was closed';
  }
}

const BYTES_PER_MB: number = 1024 * 1024;

function createIdleGarbageCollector(
  options: IRushDaemonHostOptions,
  workspaceSessionProvider: WorkspaceSessionProvider
): DaemonIdleGarbageCollector | undefined {
  const { idleGarbageCollectionDelayMs: delayMs, onLog } = options;
  if (delayMs === undefined) return undefined;
  let collect: (() => void) | undefined;
  return new DaemonIdleGarbageCollector({
    delayMs,
    collect: () => (collect ??= getReducingGarbageCollection())(),
    isEngineBusy: () => {
      const graph: IOperationGraph | undefined = workspaceSessionProvider.currentSession?.operationGraph;
      return graph !== undefined && isGraphBusy(graph);
    },
    onCollected: (collection: IDaemonIdleGarbageCollection) =>
      onLog?.(formatIdleGarbageCollection(collection)),
    onError: (error: Error) =>
      onLog?.(`rushd: idle garbage collection failed and is now off: ${error.message}`)
  });
}

function formatIdleGarbageCollection(collection: IDaemonIdleGarbageCollection): string {
  const toMB = (bytes: number): number => Math.round(bytes / BYTES_PER_MB);
  return (
    `rushd: idle garbage collection: resident memory ${toMB(collection.residentBytesBefore)} MB -> ` +
    `${toMB(collection.residentBytesAfter)} MB, heap ${toMB(collection.heapUsedBytesBefore)} MB -> ` +
    `${toMB(collection.heapUsedBytesAfter)} MB, paused ${Math.round(collection.durationMs)} ms`
  );
}
