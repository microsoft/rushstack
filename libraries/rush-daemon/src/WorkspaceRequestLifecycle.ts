// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import {
  captureProjectConfigurationFingerprintAsync,
  captureWorkspaceInputFingerprintAsync,
  classifyWorkspaceInputChange,
  EnvironmentVariableNames,
  PhasedCommandEngineBusyError,
  PhasedCommandEngineProjectConfigurationError,
  Rush,
  WorkspaceInputChangeTier,
  WorkspaceRuntimeFingerprintCache,
  type IWorkspaceInputFingerprint,
  type RushConfiguration
} from '@microsoft/rush-lib';
import type { LockFile } from '@rushstack/node-core-library';
import { NoOpTerminalProvider, Terminal } from '@rushstack/terminal';
import { findNativeLockHolder } from '@rushstack/rush-client-core';
import type {
  DaemonRestartReason,
  IDaemonCommandResult,
  IDaemonContinuingOperations,
  IDaemonEnvironmentChangedRestartReason,
  IDaemonInstallationChange,
  IDaemonRequestEnvelope
} from '@rushstack/rush-daemon-protocol';

import {
  DaemonRequestDispatchError,
  DaemonRequestEnvironmentError,
  isDaemonGraphCommand,
  type DispatchWorkspaceRequestAsync,
  type IDaemonRequestDispatchClient,
  type IDaemonRequestLifecycle,
  type IDaemonRequestResolver,
  type IResolveDaemonRequestOptions
} from './DaemonRequestDispatcher';
import { DaemonRequestUsageError } from './DaemonRequestUsageError';
import { createNativeMutationResolver } from './NativeMutationRequest';
import {
  captureNativeMutationInstallationStateAsync,
  isInstallationUnchangedByMutation,
  type INativeMutationInstallationState
} from './NativeMutationInstallationState';
import { parseDaemonGraphRequest, type IDaemonGraphRequest } from './DaemonGraphRequest';
import { isRushxInvocation, type IWorkspaceResolverLifecycle } from './WorkspaceResolverLifecycle';
import {
  RequestExclusivityClass,
  RequestScheduler,
  RequestSchedulerError,
  type IRequestLease
} from './RequestScheduler';
import {
  AdmissionProgress,
  RequestAdmissionController,
  ScriptPassage,
  ServedScriptScheduler,
  getRequestAdmissionErrorCode,
  getWorkspaceRequestScheduler
} from './WorkspaceRequestAdmission';
import { WorkspaceEngineRecreationRequiredError } from './WorkspaceEngineComponentFactory';
import { tryAcquireNativeLock } from './NativeRepositoryLock';
import { getDaemonShutdownReason } from './DaemonShutdownError';
import { getRushLibPathHandoff } from './RushLibPathHandoff';
import {
  BackgroundPreparationBusyError,
  BackgroundPreparationScheduler,
  getCaptureEnvironmentKey,
  getErrorMessage,
  isSameCommandLine,
  type IPreparationCheck,
  type IPreparationHint
} from './BackgroundPreparationScheduler';
import { assertValidRequestEnvironment, InvalidRequestEnvironment } from './RushEnvironmentValidation';
import type { IWorkspaceSession } from './WorkspaceSession';
import type { IWorkspaceInvalidationSnapshot } from './WorkspaceInvalidationTracker';
import type { WorkspaceSessionProvider } from './WorkspaceSessionProvider';
import { assertWorkspaceRequestResourcesHealthy } from './WorkspaceRequestResources';
import type {
  GetWorkspaceSuccessorLaunchAsync,
  IWorkspaceProcessRestartContext,
  IWorkspaceProcessRestartPlan,
  IWorkspaceSuccessorLaunch
} from './WorkspaceProcessRestart';
import {
  WorkspaceRestartArbiter,
  type IWorkspaceRestartRecheck,
  type IWorkspaceRestartTicket
} from './WorkspaceRestartArbiter';
import { classifyRushCommand } from './RushCommandRequestPolicy';
import { describeContinuingOperations } from './PhasedRequestRouter';
import { addStoppedContinuingOperations } from './StoppedContinuingOperations';
import { FreshCaptureCoalescer } from './FreshCaptureCoalescer';
import type { CheckDaemonInstallation } from './DaemonInstallationMonitor';
import {
  getEnvironmentIdentityEntries,
  getEnvironmentRestartReason,
  type EnvironmentIdentityEntries
} from './EnvironmentRestartReason';

/** How often a request that waits for a restart drain checks whether it still needs the restart. */
const RESTART_RECHECK_INTERVAL_MS: number = 1000;
/** A restart reason names at most this many of the changed files of Rush and its plugins. */
const MAX_REASON_IMPLEMENTATION_FILES: number = 3;

interface IRecheckCapture {
  /** On the clock of `performance.now()`. */
  readonly startTimeMs: number;
  readonly fingerprint: Promise<IWorkspaceInputFingerprint>;
}

interface IExecutionState {
  began: boolean;
  terminalAttempted: boolean;
  resultDrained: boolean;
}

interface IPreparedGeneration {
  readonly session: IWorkspaceSession;
  readonly resolver: IDaemonRequestResolver;
  readonly generation: number;
  readonly lease: IRequestLease;
  readonly fingerprint: IWorkspaceInputFingerprint;
}

interface IReloadOptions {
  /** See `IResolveDaemonRequestOptions.abortSignal`. */
  readonly abortSignal: AbortSignal;
  /** See `IResolveDaemonRequestOptions.engineCreationSignal`. The reload also checks it before it replaces anything. */
  readonly engineCreationSignal?: AbortSignal;
  /** Takes the session's workspace request scheduler exclusively. */
  readonly acquireWorkspaceLeaseAsync: (scheduler: RequestScheduler) => Promise<IRequestLease>;
  /** Takes native Rush's repository lock in `lockFolder`. */
  readonly acquireNativeLockAsync: (lockFolder: string) => Promise<LockFile>;
}

interface IReloadResult {
  readonly session: IWorkspaceSession;
  readonly fingerprint: IWorkspaceInputFingerprint;
  /** Set when the command line's selection failed after the new generation was bound; see `isSelectionRejection`. */
  readonly selectionRejection: DaemonRequestDispatchError | undefined;
  /** The invalidation sequence of `session` when the capture of `fingerprint` started. */
  readonly invalidationSequence: number;
}

interface IBackgroundPreparation {
  readonly envelope: IDaemonRequestEnvelope;
  /** Stops the preparation at its next step; see `#stopPreparationUnlessJoined`. */
  readonly controller: AbortController;
}

export interface IWorkspaceRequestLifecycleOptions {
  readonly provider: WorkspaceSessionProvider;
  readonly resolver: IDaemonRequestResolver;
  readonly rushVersion: string;
  readonly getSuccessorLaunchAsync: GetWorkspaceSuccessorLaunchAsync | undefined;
  readonly onRestartRequested: (plan: IWorkspaceProcessRestartPlan) => void;
  /** Checked before each request; a removed or replaced installation restarts the process without a successor. */
  readonly checkInstallation?: CheckDaemonInstallation;
  /** Receives messages for the daemon log. */
  readonly onLog?: (message: string) => void;
}

class RestartBeforeExecution extends Error {
  public readonly plan: IWorkspaceProcessRestartPlan;
  public readonly session: IWorkspaceSession;
  public readonly lease: IRequestLease;
  public readonly workspaceLease: IRequestLease;
  public constructor(
    plan: IWorkspaceProcessRestartPlan,
    session: IWorkspaceSession,
    lease: IRequestLease,
    workspaceLease: IRequestLease
  ) {
    super(
      'Workspace process inputs changed. No operation was scheduled or executed. Reconnect and submit a new request after restart.'
    );
    this.plan = plan;
    this.session = session;
    this.lease = lease;
    this.workspaceLease = workspaceLease;
  }
}

class RestartPendingBeforeExecution extends Error {
  public constructor() {
    super('The workspace is restarting. No operation was scheduled or executed.');
  }
}

class InstallationChangedBeforeExecution extends Error {
  public constructor(change: IDaemonInstallationChange) {
    super(
      `The daemon's installation at ${change.folder} was ${change.change}. No operation was scheduled or executed. Reconnect and submit a new request after restart.`
    );
  }
}

/**
 * Generation admission composes the existing request schedulers, native locks and session provider.
 * It never releases a resolved request onto a different session, and never replays scheduled work.
 */
export class WorkspaceRequestLifecycle implements IDaemonRequestLifecycle {
  readonly #options: IWorkspaceRequestLifecycleOptions;
  readonly #gate: RequestScheduler = new RequestScheduler();
  /**
   * A served rushx script needs its generation only to resolve, so once it starts it releases `#gate` and holds a
   * shared lease here until it exits: a reload no longer waits for a dev server or watch script. Whatever
   * would end the script with this process (a restart, a native mutation, disposal) waits for this lease after
   * taking `#gate` exclusively, when no other script can start.
   */
  readonly #scripts: ServedScriptScheduler = new ServedScriptScheduler();
  /**
   * Open while a reload waits for another Rush process to release the repository's lock, which may take any length of
   * time: a served rushx script that arrives or waits then passes the reload, and resolves and starts on the current
   * generation, as it would have before the reload began. The reload waits for it only until it has started.
   */
  readonly #scriptPassage: ScriptPassage = new ScriptPassage();
  readonly #restartArbiter: WorkspaceRestartArbiter = new WorkspaceRestartArbiter();
  readonly #abortController: AbortController = new AbortController();
  readonly #observers: Set<AbortController> = new Set();
  readonly #terminal: Terminal = new Terminal(new NoOpTerminalProvider());
  readonly #runtimePaths: ReadonlyArray<string> = [__dirname, path.resolve(__dirname, '../package.json')];
  // Resolved once: after the installation is removed, resolving it again would fail before the restart check.
  readonly #rushLibPath: string = getRushLibPathHandoff(
    require.resolve('@microsoft/rush-lib'),
    process.env[EnvironmentVariableNames._RUSH_LIB_PATH]
  );
  readonly #repoRoot: string;
  /** The daemon's environment before any engine ran. A plugin may add names to `process.env` later. */
  readonly #startupEnvironment: Record<string, string>;
  /** The variables of `#startupEnvironment` that the startup fingerprint's `environmentHash` includes. */
  readonly #startupEnvironmentEntries: EnvironmentIdentityEntries;
  readonly #startupFingerprint: IWorkspaceInputFingerprint;
  readonly #runtimeCache: WorkspaceRuntimeFingerprintCache;
  // Concurrent requests share captures; each capture still starts after the requests it serves arrived.
  // The coalescers' default clock, performance.now(), is also the clock of receivedTimeMs.
  readonly #fingerprintCaptures: FreshCaptureCoalescer<RushConfiguration, IWorkspaceInputFingerprint> =
    new FreshCaptureCoalescer();
  readonly #projectFingerprintCaptures: FreshCaptureCoalescer<RushConfiguration, string> =
    new FreshCaptureCoalescer();
  /** The latest capture that a request waiting for a restart drain started, for each workspace configuration. */
  readonly #recheckCaptures: WeakMap<RushConfiguration, IRecheckCapture> = new WeakMap();
  #fingerprint: IWorkspaceInputFingerprint;
  #projectFingerprint: string | undefined;
  #commandIdentity: string | undefined;
  #resolver: IDaemonRequestResolver;
  readonly #ownedResolvers: Set<IDaemonRequestResolver> = new Set();
  #boundSession: IWorkspaceSession | undefined;
  #forceReload: boolean = false;
  #closing: boolean = false;
  #restartPending: boolean = false;
  /** Why the pending restart happens, when the request that it is for has a different environment. */
  #restartReason: IDaemonEnvironmentChangedRestartReason | undefined;
  #lastReloadTier: WorkspaceInputChangeTier = WorkspaceInputChangeTier.Reuse;
  #installationChange: IDaemonInstallationChange | undefined;
  #transitioning: boolean = false;
  /**
   * Whether a served rushx script may be admitted ahead of the transition while its owner waits for `#gate`: only if
   * the owner reloads the graph, which leaves scripts running, rather than restarting the daemon or running a native
   * mutation, which would end them with this process. The script then starts on the current generation, as it would
   * have before the reload was requested; it reads its package.json when it runs. Each owner sets it, and it is read
   * only while `#transitioning`.
   */
  #scriptsMayPassTransition: boolean = false;
  /** Active while the transition owner holds the exclusive gate and loads or reloads the workspace graph. */
  readonly #transitionProgress: AdmissionProgress = new AdmissionProgress();
  #cleanupFailure: unknown;
  #disposePromise: Promise<void> | undefined;
  /** How many calls of `dispatchAsync` have not returned. */
  #activeDispatchCount: number = 0;
  /** Keeps the command line of the last phased command that was served, and says when to prepare it again. */
  readonly #preparations: BackgroundPreparationScheduler;
  /** `getCaptureEnvironmentKey` of the environment of every background preparation. */
  readonly #preparationEnvironmentKey: string;
  /** The background preparation that holds `#gate`. */
  #preparation: IBackgroundPreparation | undefined;
  #preparationCount: number = 0;

  private constructor(
    options: IWorkspaceRequestLifecycleOptions,
    repoRoot: string,
    fingerprint: IWorkspaceInputFingerprint,
    runtimeCache: WorkspaceRuntimeFingerprintCache,
    startupEnvironment: Record<string, string>
  ) {
    this.#options = options;
    this.#repoRoot = repoRoot;
    this.#startupFingerprint = this.#fingerprint = fingerprint;
    this.#resolver = options.resolver;
    this.#ownedResolvers.add(options.resolver);
    this.#runtimeCache = runtimeCache;
    this.#startupEnvironment = startupEnvironment;
    this.#startupEnvironmentEntries = getEnvironmentIdentityEntries(startupEnvironment);
    // The daemon's own environment, which each request that it serves has too, as far as the workspace fingerprint
    // reads it, with the engine that `dispatchAsync` sets for every request. A client's other variables are never kept.
    const preparationEnvironment: Readonly<Record<string, string>> = Object.freeze({
      ...startupEnvironment,
      [EnvironmentVariableNames._RUSH_LIB_PATH]: this.#rushLibPath
    });
    this.#preparationEnvironmentKey = getCaptureEnvironmentKey(preparationEnvironment);
    this.#preparations = new BackgroundPreparationScheduler({
      environment: preparationEnvironment,
      checkAsync: () => this.#tryStartPreparationAsync(),
      onLog: (message: string) => this.#options.onLog?.(message)
    });
  }

  public static async createAsync(
    options: IWorkspaceRequestLifecycleOptions
  ): Promise<WorkspaceRequestLifecycle> {
    const session: IWorkspaceSession = await options.provider.getSessionAsync();
    const runtimeCache: WorkspaceRuntimeFingerprintCache = new WorkspaceRuntimeFingerprintCache();
    // The startup fingerprint hashes this copy, so that a restart for another environment can name what differs.
    const startupEnvironment: Record<string, string> = Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
    );
    const fingerprint: IWorkspaceInputFingerprint = await captureWorkspaceInputFingerprintAsync({
      rushConfiguration: session.rushConfiguration,
      environment: startupEnvironment,
      runtimePaths: [__dirname, path.resolve(__dirname, '../package.json')],
      runtimeCache
    });
    return new WorkspaceRequestLifecycle(
      options,
      session.metadata.repoRoot,
      fingerprint,
      runtimeCache,
      startupEnvironment
    );
  }

  /** The last applied input decision; reading status never changes or reloads the workspace. */
  public get lastReloadTier(): WorkspaceInputChangeTier {
    return this.#lastReloadTier;
  }

  public async dispatchAsync(
    request: IDaemonRequestEnvelope,
    destination: IDaemonRequestDispatchClient,
    dispatchWorkspaceRequestAsync: DispatchWorkspaceRequestAsync
  ): Promise<void> {
    this.#activeDispatchCount++;
    try {
      await this.#dispatchCoreAsync(request, destination, dispatchWorkspaceRequestAsync);
    } finally {
      this.#activeDispatchCount--;
      this.#preparations.resume(this.#isIdle());
    }
  }

  async #dispatchCoreAsync(
    request: IDaemonRequestEnvelope,
    destination: IDaemonRequestDispatchClient,
    dispatchWorkspaceRequestAsync: DispatchWorkspaceRequestAsync
  ): Promise<void> {
    const receivedTimeMs: number = destination.receivedTimeMs ?? performance.now();
    const dispatchAsync: DispatchWorkspaceRequestAsync = (options) =>
      dispatchWorkspaceRequestAsync({
        ...options,
        lifecycleInfo: {
          receivedTimeMs,
          preparedTimeMs: performance.now(),
          reloadTier: this.#lastReloadTier
        }
      });
    const envelope: IDaemonRequestEnvelope = {
      ...request,
      environment: {
        ...request.environment,
        [EnvironmentVariableNames._RUSH_LIB_PATH]: this.#rushLibPath
      }
    };
    this.#stopPreparationUnlessJoined(envelope);
    this.#detectInstallationChange();
    if (this.#restartPending) {
      await destination.interactiveSession.finishAsync();
      await destination.writeResultAsync(
        this.#restartPendingResult(envelope.requestId, new RestartPendingBeforeExecution())
      );
      return;
    }
    if (this.#closing)
      throw new Error('The workspace lifecycle is closing. No operation was scheduled or executed.');
    if (this.#cleanupFailure !== undefined && !this.#installationChange) throw this.#cleanupFailure;
    const state: IExecutionState = { began: false, terminalAttempted: false, resultDrained: false };
    const observer: AbortController | undefined = isGraphWatch(envelope) ? new AbortController() : undefined;
    if (observer) this.#observers.add(observer);
    const preemption: AbortController = new AbortController();
    const signal: AbortSignal = AbortSignal.any([
      destination.abortSignal,
      this.#abortController.signal,
      preemption.signal,
      ...(observer ? [observer.signal] : [])
    ]);
    let canYieldAfterResult: boolean = false;
    let onResultDrained: (() => void) | undefined;
    const client: IDaemonRequestDispatchClient = createLifecycleClient(
      destination,
      signal,
      state,
      () => onResultDrained?.(),
      (exclusivityClass: RequestExclusivityClass) => {
        canYieldAfterResult = mayContinueAfterResult(envelope, exclusivityClass);
      }
    );
    const admission: RequestAdmissionController = new RequestAdmissionController({
      admission: envelope.admission,
      client,
      requestId: envelope.requestId
    });
    let ticket: IWorkspaceRestartTicket | undefined = observer
      ? undefined
      : this.#restartArbiter.enter({ runsScript: isRushxInvocation(envelope) });
    let generation: IPreparedGeneration | undefined;
    try {
      for (let attempt: number = 0; ; attempt++) {
        if (this.#installationChange) {
          // An observer waits for the restart like any other request, so from here on the drain tracks it too.
          ticket ??= this.#restartArbiter.enter();
          await this.#restartForInstallationAsync(
            envelope,
            client,
            admission,
            ticket,
            this.#installationChange
          );
          return;
        }
        let scriptLease: IRequestLease | undefined;
        try {
          canYieldAfterResult = false;
          this.#throwIfUnsupportedCommand(envelope);
          const prepared: IPreparedGeneration = await this.#prepareAsync(
            envelope,
            client,
            admission,
            ticket,
            receivedTimeMs
          );
          generation = prepared;
          if (envelope.returnEarlyOnFailure === true)
            onResultDrained = () =>
              canYieldAfterResult && this.#yieldAfterResult(prepared.lease, ticket, preemption);
          if (isRushxInvocation(envelope)) {
            scriptLease = await admission.acquireAsync(this.#scripts, RequestExclusivityClass.SharedBuild);
          }
          const requestEnvelope: IDaemonRequestEnvelope = {
            ...envelope,
            admission: admission.remainingAdmission
          };
          if (isMutation(envelope)) {
            await this.#executeMutationAsync(prepared, requestEnvelope, client, state, dispatchAsync);
          } else {
            await dispatchAsync({
              envelope: requestEnvelope,
              client,
              workspaceSession: prepared.session,
              resolver: prepared.resolver,
              onExecutionStarting: () => {
                this.#assertGeneration(prepared);
                state.began = true;
                if (scriptLease) prepared.lease.release();
              }
            });
          }
          return;
        } catch (error) {
          if (
            error instanceof WorkspaceEngineRecreationRequiredError &&
            !state.began &&
            !state.terminalAttempted &&
            !isGraphRequest(envelope) &&
            attempt < 1
          ) {
            this.#forceReload = true;
            continue;
          }
          if (error instanceof RestartBeforeExecution && !state.began && !state.terminalAttempted) {
            const restartReason: IDaemonEnvironmentChangedRestartReason | undefined =
              getEnvironmentRestartReason(this.#startupEnvironmentEntries, error.plan.environment);
            try {
              await client.interactiveSession.finishAsync();
              await client.writeResultAsync({
                ...preExecutionFailure(envelope.requestId, error),
                retryAfterRestart: true,
                ...(restartReason && { restartReason })
              });
              error.session.retire?.();
              this.#lastReloadTier = WorkspaceInputChangeTier.Restart;
              this.#restartReason = restartReason;
              this.#restartPending = true;
              this.#closing = true;
              if (restartReason) {
                this.#options.onLog?.(
                  `rushd: restarting for request ${envelope.requestId}, whose environment differs from this ` +
                    `daemon's in ${restartReason.variableNames.join(', ')}`
                );
              }
              this.#options.onRestartRequested(error.plan);
            } finally {
              error.workspaceLease.release();
              error.lease.release();
            }
            return;
          }
          if (error instanceof RestartPendingBeforeExecution && !state.began && !state.terminalAttempted) {
            await client.interactiveSession.finishAsync();
            await client.writeResultAsync(this.#restartPendingResult(envelope.requestId, error));
            return;
          }
          if (error instanceof InvalidRequestEnvironment && !state.began && !state.terminalAttempted) {
            await client.interactiveSession.finishAsync();
            await client.writeResultAsync(preExecutionFailure(envelope.requestId, error));
            return;
          }
          if (error instanceof RequestSchedulerError && !state.began && !state.terminalAttempted) {
            await writeAdmissionFailureAsync(envelope, client, error);
            return;
          }
          // A request that failed before it began because the installation changed under it, for example on a
          // module that the daemon could no longer load, waits for the restart like any other request.
          if (!state.began && !state.terminalAttempted && this.#detectInstallationChange()) continue;
          if (
            isFallbackRejection(error) &&
            !state.began &&
            !state.terminalAttempted &&
            !mayFallBackAlongsideContinuingWork(envelope)
          ) {
            // The client runs this command in-process instead. Work that finished requests continue would run
            // alongside it, like two Rush commands in one checkout.
            generation?.lease.release();
            throw await this.#stopContinuingWorkBeforeFallbackAsync(error, client.abortSignal);
          }
          throw error;
        } finally {
          onResultDrained = undefined;
          generation?.lease.release();
          generation = undefined;
          scriptLease?.release();
        }
      }
    } finally {
      if (ticket) this.#restartArbiter.leave(ticket);
      admission.dispose();
      if (observer) this.#observers.delete(observer);
    }
  }

  /**
   * A request that may return its result before its work ends (a failed build whose independent operations
   * continue) must not delay other requests once its client has that result, since nobody waits for that work:
   * a restart no longer waits for it, and a request that needs this generation exclusively stops it, as does a
   * request that the client runs in-process instead (see `#stopContinuingWorkAsync`).
   */
  #yieldAfterResult(
    lease: IRequestLease,
    ticket: IWorkspaceRestartTicket | undefined,
    preemption: AbortController
  ): void {
    if (ticket) this.#restartArbiter.leave(ticket);
    this.#gate.markLeasePreemptible(lease, () =>
      preemption.abort(
        new Error('A request that cannot run alongside this finished request stopped its remaining work.')
      )
    );
  }

  /** Stops the work that finished requests continue (see `#yieldAfterResult`) and waits until it has stopped. */
  async #stopContinuingWorkAsync(abortSignal: AbortSignal): Promise<void> {
    const stopped: Promise<void> = this.#gate.preemptLeasesAsync();
    if (abortSignal.aborted) return;
    let onAbort: () => void = () => undefined;
    const aborted: Promise<void> = new Promise((resolve) => {
      onAbort = resolve;
      abortSignal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      await Promise.race([stopped, aborted]);
    } finally {
      abortSignal.removeEventListener('abort', onAbort);
    }
  }

  /**
   * Stops the work that finished requests continue before the client of `rejection` runs its command in-process, and
   * returns the rejection to send. If that stopped all of the operations that an earlier failed command left running,
   * and the client still waits, the rejection names them.
   */
  async #stopContinuingWorkBeforeFallbackAsync(
    rejection: DaemonRequestDispatchError,
    abortSignal: AbortSignal
  ): Promise<DaemonRequestDispatchError> {
    const session: IWorkspaceSession | undefined = this.#options.provider.currentSession;
    const continuing: IDaemonContinuingOperations | undefined =
      session && describeContinuingOperations(session);
    await this.#stopContinuingWorkAsync(abortSignal);
    if (!session || !continuing || abortSignal.aborted || describeContinuingOperations(session)) {
      return rejection;
    }
    return addStoppedContinuingOperations(rejection, continuing);
  }

  async #prepareAsync(
    envelope: IDaemonRequestEnvelope,
    client: IDaemonRequestDispatchClient,
    admission: RequestAdmissionController,
    ticket: IWorkspaceRestartTicket | undefined,
    receivedTimeMs: number,
    admittedLease?: IRequestLease
  ): Promise<IPreparedGeneration> {
    let lease: IRequestLease =
      admittedLease ??
      (isRushxInvocation(envelope)
        ? await this.#admitScriptAsync(admission)
        : this.#transitioning
          ? await admission.acquireBehindTransitionAsync(this.#gate, this.#transitionProgress)
          : await admission.acquireAsync(this.#gate, RequestExclusivityClass.SharedBuild));
    let ownsTransition: boolean = false;
    try {
      if (this.#restartPending) throw new RestartPendingBeforeExecution();
      this.#throwIfInstallationChanged();
      if (this.#closing)
        throw new Error('The workspace is restarting. No operation was scheduled or executed.');
      if (this.#cleanupFailure !== undefined) throw this.#cleanupFailure;
      let session: IWorkspaceSession = await this.#options.provider.getSessionAsync();
      assertWorkspaceRequestResourcesHealthy(session);
      if (isRushxInvocation(envelope)) {
        if (ticket && this.#restartArbiter.hasPendingRestart(ticket)) {
          // The restart would wait for the script to exit, so the script waits for the restart instead. If the restart
          // is planned, the next attempt tells the client to run the script on the successor.
          lease.release();
          await admission.waitForPendingRestartAsync(this.#restartArbiter, ticket);
          return await this.#prepareAsync(envelope, client, admission, ticket, receivedTimeMs);
        }
        return this.#createPreparedGeneration(session, lease);
      }
      if (isGraphRequest(envelope)) {
        const graphRequest: IDaemonGraphRequest = parseDaemonGraphRequest(envelope);
        if (session.operationGraph && !['show', 'status', 'watch'].includes(graphRequest.verb)) {
          // Graph control environment flags are not a request to change the retained engine environment.
          const controlEnvelope: IDaemonRequestEnvelope = {
            ...envelope,
            environment: { ...this.#startupEnvironment }
          };
          const current: IWorkspaceInputFingerprint = await this.#captureAsync(session, controlEnvelope);
          const currentTier: WorkspaceInputChangeTier = this.#classify(current, false);
          if (currentTier === WorkspaceInputChangeTier.Restart) {
            await this.#restartBeforeExecutionAsync(
              controlEnvelope,
              admission,
              ticket,
              lease,
              session,
              current,
              false
            );
            return await this.#prepareAsync(envelope, client, admission, ticket, receivedTimeMs);
          }
          if (
            currentTier !== WorkspaceInputChangeTier.Reuse ||
            (this.#boundSession &&
              this.#projectFingerprint !== (await this.#captureProjectFingerprintAsync(session)))
          ) {
            throw new Error(
              'Graph inputs changed. Load the new generation with a supported build request; no operation was scheduled or executed.'
            );
          }
        }
        return this.#createPreparedGeneration(session, lease);
      }
      if (
        envelope.commandOrigin === 'built-in' &&
        !['build', 'rebuild', 'install', 'update'].includes(envelope.commandName)
      ) {
        return this.#createPreparedGeneration(session, lease);
      }
      let commandIdentity: string | undefined;
      if (envelope.commandOrigin === 'custom') {
        // Only phased custom commands are served. Parsing before any input capture rejects a global command
        // before it can reload or restart this workspace. A phased command whose environment differs from this
        // daemon's continues to the capture, which restarts the daemon for it, as it does for build.
        commandIdentity = await tryGetCustomCommandParameterIdentityAsync(this.#resolver, {
          envelope,
          workspaceSession: session,
          abortSignal: client.abortSignal
        });
      }
      // The client changes the workspace before it sends a request, so any capture that started after the request
      // was received sees those changes. Captures that must detect changes made during a transition stay strict.
      let fingerprint: IWorkspaceInputFingerprint = await this.#captureAsync(
        session,
        envelope,
        receivedTimeMs
      );
      let tier: WorkspaceInputChangeTier = this.#classify(fingerprint, isMutation(envelope));
      if (tier === WorkspaceInputChangeTier.Restart) assertValidRequestEnvironment(envelope.environment);
      let projectFingerprint: string | undefined;
      if (tier !== WorkspaceInputChangeTier.Restart && !isMutation(envelope)) {
        commandIdentity ??= await getCommandParameterIdentityAsync(
          this.#resolver,
          { envelope, workspaceSession: session, abortSignal: client.abortSignal },
          this.#isConfigurationCurrent(session, tier)
        );
        if (tier === WorkspaceInputChangeTier.Reuse) {
          projectFingerprint = await this.#tryCaptureProjectFingerprintAsync(session, receivedTimeMs);
          if (
            this.#boundSession !== session ||
            this.#commandIdentity !== commandIdentity ||
            projectFingerprint === undefined ||
            this.#projectFingerprint !== projectFingerprint ||
            this.#forceReload ||
            !session.invalidations.getSnapshot().isWatcherHealthy ||
            session.invalidations.hasUnattributedUnknownChanges
          )
            tier = WorkspaceInputChangeTier.Reload;
        }
      }
      if (tier === WorkspaceInputChangeTier.Reuse && !isMutation(envelope)) {
        this.#lastReloadTier = WorkspaceInputChangeTier.Reuse;
        this.#preparations.remember(session, envelope);
        return this.#createPreparedGeneration(session, lease, fingerprint);
      }

      if (tier === WorkspaceInputChangeTier.Restart && ticket) {
        await this.#restartBeforeExecutionAsync(
          envelope,
          admission,
          ticket,
          lease,
          session,
          fingerprint,
          isMutation(envelope)
        );
        return await this.#prepareAsync(envelope, client, admission, ticket, receivedTimeMs);
      } else {
        lease.release();
      }
      if (this.#transitioning) {
        const shared: IRequestLease = await admission.acquireBehindTransitionAsync(
          this.#gate,
          this.#transitionProgress
        );
        return await this.#prepareAsync(envelope, client, admission, ticket, receivedTimeMs, shared);
      }
      this.#transitioning = ownsTransition = true;
      this.#scriptsMayPassTransition = tier === WorkspaceInputChangeTier.Reload && !isMutation(envelope);
      this.#cancelObservers();
      const continuingSession: IWorkspaceSession = session;
      lease = await admission.acquireAsync(this.#gate, RequestExclusivityClass.Exclusive, undefined, () =>
        describeContinuingOperations(continuingSession)
      );
      this.#transitionProgress.setActive(true);
      if (this.#restartPending) throw new RestartPendingBeforeExecution();
      this.#throwIfInstallationChanged();
      if (this.#closing)
        throw new Error('The workspace is restarting. No operation was scheduled or executed.');
      session = await this.#options.provider.getSessionAsync();
      fingerprint = await this.#captureAsync(session, envelope);
      tier = this.#classify(fingerprint, isMutation(envelope));
      if (tier === WorkspaceInputChangeTier.Restart) {
        assertValidRequestEnvironment(envelope.environment);
        await this.#throwRestartBeforeExecutionAsync(
          envelope,
          admission,
          lease,
          session,
          fingerprint,
          isMutation(envelope)
        );
      }
      if (ticket) this.#restartArbiter.withdrawRestart(ticket);
      if (isMutation(envelope)) {
        if (!this.#options.getSuccessorLaunchAsync) {
          throw new DaemonRequestDispatchError(
            'unsupported',
            'Native mutations require a successor launcher. No worker was started.'
          );
        }
        await this.#waitForServedScriptsAsync(admission, undefined, {
          kind: 'nativeMutation',
          commandName: envelope.commandName
        });
        await this.#quiesceWarmSetAsync(session);
        this.#throwIfInstallationChanged();
        return this.#createPreparedGeneration(session, lease, fingerprint);
      }

      commandIdentity = await getCommandParameterIdentityAsync(
        this.#resolver,
        { envelope, workspaceSession: session, abortSignal: client.abortSignal },
        this.#isConfigurationCurrent(session, tier)
      );
      if (
        this.#boundSession === session &&
        this.#commandIdentity === commandIdentity &&
        tier === WorkspaceInputChangeTier.Reuse &&
        !this.#forceReload &&
        session.invalidations.getSnapshot().isWatcherHealthy &&
        !session.invalidations.hasUnattributedUnknownChanges
      ) {
        projectFingerprint = await this.#tryCaptureProjectFingerprintAsync(session);
        if (projectFingerprint !== undefined && projectFingerprint === this.#projectFingerprint) {
          this.#lastReloadTier = WorkspaceInputChangeTier.Reuse;
          this.#preparations.remember(session, envelope);
          this.#gate.downgradeExclusiveLease(lease, RequestExclusivityClass.SharedBuild);
          return this.#createPreparedGeneration(session, lease, fingerprint);
        }
      }
      const reload: IReloadResult = await this.#reloadAsync(session, envelope, {
        abortSignal: client.abortSignal,
        acquireWorkspaceLeaseAsync: (scheduler: RequestScheduler) =>
          admission.acquireAsync(scheduler, RequestExclusivityClass.Exclusive),
        acquireNativeLockAsync: async (lockFolder: string) => {
          const loading: boolean = this.#transitionProgress.active;
          this.#transitionProgress.setActive(false);
          try {
            return await this.#acquireReloadLockAsync(admission, lockFolder);
          } finally {
            this.#transitionProgress.setActive(loading);
          }
        }
      });
      if (reload.selectionRejection) throw reload.selectionRejection;
      this.#preparations.remember(reload.session, envelope, reload.invalidationSequence);
      this.#gate.downgradeExclusiveLease(lease, RequestExclusivityClass.SharedBuild);
      return this.#createPreparedGeneration(reload.session, lease, reload.fingerprint);
    } catch (error) {
      if (!(error instanceof RestartBeforeExecution)) lease.release();
      throw error;
    } finally {
      if (ownsTransition) {
        this.#transitioning = false;
        this.#transitionProgress.setActive(false);
      }
    }
  }

  #createPreparedGeneration(
    session: IWorkspaceSession,
    lease: IRequestLease,
    fingerprint: IWorkspaceInputFingerprint = this.#fingerprint
  ): IPreparedGeneration {
    const resolver: IDaemonRequestResolver = this.#resolver;
    const generation: number = this.#options.provider.generation;
    return { session, resolver, generation, lease, fingerprint };
  }

  async #restartBeforeExecutionAsync(
    envelope: IDaemonRequestEnvelope,
    admission: RequestAdmissionController,
    ticket: IWorkspaceRestartTicket | undefined,
    lease: IRequestLease,
    session: IWorkspaceSession,
    fingerprint: IWorkspaceInputFingerprint,
    mutation: boolean
  ): Promise<void> {
    lease.release();
    if (ticket) {
      const drained: boolean = await admission.waitForRestartDrainAsync(
        this.#restartArbiter,
        ticket,
        this.#getRestartReason(fingerprint, envelope.environment, mutation),
        this.#createRestartRecheck(session, envelope, fingerprint, mutation)
      );
      if (this.#restartPending) throw new RestartPendingBeforeExecution();
      if (!drained) return;
    }
    this.#cancelObservers();
    const exclusiveLease: IRequestLease = await admission.acquireAsync(
      this.#gate,
      RequestExclusivityClass.Exclusive
    );
    try {
      if (this.#restartPending) throw new RestartPendingBeforeExecution();
      this.#throwIfInstallationChanged();
      if (this.#closing)
        throw new Error('The workspace is restarting. No operation was scheduled or executed.');
      const currentSession: IWorkspaceSession = await this.#options.provider.getSessionAsync();
      const current: IWorkspaceInputFingerprint = await this.#captureAsync(currentSession, envelope);
      if (this.#classify(current, mutation) !== WorkspaceInputChangeTier.Restart) {
        if (ticket) this.#restartArbiter.withdrawRestart(ticket);
        exclusiveLease.release();
        return;
      }
      assertValidRequestEnvironment(envelope.environment);
      await this.#throwRestartBeforeExecutionAsync(
        envelope,
        admission,
        exclusiveLease,
        currentSession,
        current,
        mutation
      );
    } catch (error) {
      if (!(error instanceof RestartBeforeExecution)) exclusiveLease.release();
      throw error;
    }
  }

  async #throwRestartBeforeExecutionAsync(
    envelope: IDaemonRequestEnvelope,
    admission: RequestAdmissionController,
    lease: IRequestLease,
    session: IWorkspaceSession,
    fingerprint: IWorkspaceInputFingerprint,
    mutation: boolean
  ): Promise<never> {
    await this.#waitForServedScriptsAsync(
      admission,
      this.#getRestartReason(fingerprint, envelope.environment, mutation)
    );
    await this.#quiesceWarmSetAsync(session);
    const workspaceLease: IRequestLease = await admission.acquireAsync(
      getWorkspaceRequestScheduler(session),
      RequestExclusivityClass.Exclusive
    );
    try {
      this.#throwIfInstallationChanged();
      const plan: IWorkspaceProcessRestartPlan = await this.#restartPlanAsync(
        session,
        envelope,
        'hard-input-change'
      );
      throw new RestartBeforeExecution(plan, session, lease, workspaceLease);
    } catch (error) {
      if (!(error instanceof RestartBeforeExecution)) workspaceLease.release();
      throw error;
    }
  }

  /**
   * Replaces the current generation: loads a new session and binds a new resolver's engine to it with the command line
   * of `envelope`. The caller owns the transition and holds `#gate` exclusively. A reload that fails leaves
   * `#forceReload` set, so that the next request reloads again.
   */
  async #reloadAsync(
    session: IWorkspaceSession,
    envelope: IDaemonRequestEnvelope,
    options: IReloadOptions
  ): Promise<IReloadResult> {
    const { abortSignal, engineCreationSignal } = options;
    await this.#quiesceWarmSetAsync(session);
    const workspaceLease: IRequestLease = await options.acquireWorkspaceLeaseAsync(
      getWorkspaceRequestScheduler(session)
    );
    let nativeLock: LockFile;
    try {
      nativeLock = await options.acquireNativeLockAsync(session.rushConfiguration.commonTempFolder);
    } catch (error) {
      workspaceLease.release();
      throw error;
    }
    let selectionRejection: DaemonRequestDispatchError | undefined;
    try {
      const before: IWorkspaceInputFingerprint = await this.#captureAsync(session, envelope);
      let expectedFingerprint: IWorkspaceInputFingerprint = before;
      const validationContext: { session?: IWorkspaceSession } = {};
      const previousResolver: IDaemonRequestResolver = this.#resolver;
      // A background preparation that a request stopped replaces nothing. From here on it stops only in the engine's
      // own steps, once the new session and resolver are in place.
      engineCreationSignal?.throwIfAborted();
      const resolver: IDaemonRequestResolver = getResolverLifecycle(previousResolver).createForSession(
        nativeLock,
        async () => {
          const replacementSession: IWorkspaceSession | undefined = validationContext.session;
          if (!replacementSession) throw new Error('The replacement generation is not initialized.');
          const current: IWorkspaceInputFingerprint = await this.#captureAsync(replacementSession, envelope);
          if (classifyWorkspaceInputChange(expectedFingerprint, current) !== WorkspaceInputChangeTier.Reuse) {
            throw new WorkspaceEngineRecreationRequiredError();
          }
        }
      );
      this.#ownedResolvers.add(resolver);
      try {
        if (resolver === previousResolver) {
          throw new Error('A new workspace generation must receive a new resolver instance.');
        }
        getResolverLifecycle(resolver);
      } catch (error) {
        this.#cleanupFailure = error;
        throw error;
      }
      this.#resolver = resolver;
      try {
        await previousResolver[Symbol.asyncDispose]?.();
        this.#ownedResolvers.delete(previousResolver);
      } catch (error) {
        this.#cleanupFailure = error;
        throw error;
      }
      const replacementSession: IWorkspaceSession = await this.#options.provider.reloadAsync();
      validationContext.session = replacementSession;
      session = replacementSession;
      try {
        await resolver.resolveRequestAsync({
          envelope,
          workspaceSession: session,
          abortSignal,
          engineCreationSignal
        });
      } catch (error) {
        // An invalid selection (such as an unknown project) fails after the new graph was bound. Keep that
        // generation, so that the next request does not load the whole workspace again.
        if (!isSelectionRejection(error, session)) throw error;
        selectionRejection = error;
      }
      const invalidationSequence: number = session.invalidations.getSnapshot().sequence;
      const after: IWorkspaceInputFingerprint = await this.#captureAsync(session, envelope);
      if (classifyWorkspaceInputChange(before, after) !== WorkspaceInputChangeTier.Reuse) {
        this.#forceReload = true;
        throw new WorkspaceEngineRecreationRequiredError();
      }
      this.#resolver = resolver;
      expectedFingerprint = after;
      this.#boundSession = session;
      this.#fingerprint = after;
      this.#projectFingerprint = await this.#tryCaptureProjectFingerprintAsync(session);
      this.#commandIdentity = await getResolverLifecycle(resolver).getCommandParameterIdentityAsync({
        envelope,
        workspaceSession: session,
        abortSignal
      });
      this.#lastReloadTier = WorkspaceInputChangeTier.Reload;
      this.#forceReload = false;
      return { session, fingerprint: after, selectionRejection, invalidationSequence };
    } catch (error) {
      this.#forceReload = true;
      if (error instanceof AggregateError) this.#cleanupFailure = error;
      throw error;
    } finally {
      nativeLock.release();
      workspaceLease.release();
    }
  }

  /**
   * Whether nothing runs or waits on this daemon: no request, served rushx script, graph observer, transition or
   * background preparation, and no pending restart, closing, cleanup failure or installation change.
   */
  #isIdle(): boolean {
    return (
      this.#activeDispatchCount === 0 &&
      this.#preparation === undefined &&
      !this.#transitioning &&
      !this.#restartPending &&
      !this.#closing &&
      this.#cleanupFailure === undefined &&
      this.#installationChange === undefined &&
      this.#gate.activeRequestCount === 0 &&
      this.#gate.queuedRequestCount === 0 &&
      this.#scripts.activeRequestCount === 0 &&
      this.#scripts.queuedRequestCount === 0
    );
  }

  /**
   * Starts a background preparation if the kept command line's next request would reload the workspace graph (the
   * same classification as `#prepareAsync`, from a capture that starts now), the daemon is idle and no other Rush
   * process holds the repository's lock. It checks each state of the workspace once: a later change, request or
   * reload makes it check again. It does not act on a change that its capture cannot see, such as an unknown change
   * or an unhealthy watcher, and it never restarts the daemon; the next request does both, as it would anyway.
   */
  async #tryStartPreparationAsync(): Promise<void> {
    const hint: IPreparationHint | undefined = this.#preparations.hint;
    if (!hint) return;
    if (!this.#isIdle()) {
      this.#preparations.defer();
      return;
    }
    const { session } = hint;
    if (this.#options.provider.currentSession !== session || this.#detectInstallationChange()) return;
    const snapshot: IWorkspaceInvalidationSnapshot = session.invalidations.getSnapshot();
    const check: IPreparationCheck = {
      session,
      sequence: snapshot.sequence,
      boundSession: this.#boundSession,
      forceReload: this.#forceReload
    };
    if (this.#preparations.isChecked(check)) return;
    if (!snapshot.isWatcherHealthy) {
      this.#preparations.markChecked(check);
      return;
    }
    if (findNativeLockHolder(session.rushConfiguration.commonTempFolder).pid !== undefined) {
      this.#preparations.retry();
      return;
    }
    const fingerprint: IWorkspaceInputFingerprint = await this.#captureAsync(session, hint.envelope);
    if (
      this.#preparations.hint !== hint ||
      this.#options.provider.currentSession !== session ||
      !this.#isIdle()
    ) {
      this.#preparations.defer();
      this.#preparations.resume(this.#isIdle());
      return;
    }
    const tier: WorkspaceInputChangeTier = this.#classify(fingerprint, false);
    if (
      tier === WorkspaceInputChangeTier.Restart ||
      (tier === WorkspaceInputChangeTier.Reuse && this.#boundSession === session && !this.#forceReload)
    ) {
      this.#preparations.markChecked(check);
      return;
    }
    this.#startPreparation(hint);
  }

  /** Takes `#gate` for a background preparation, which the daemon is idle enough to admit at once. */
  #startPreparation(hint: IPreparationHint): void {
    const lease: Promise<IRequestLease> = this.#gate.acquireAsync({
      exclusivityClass: RequestExclusivityClass.Exclusive,
      noWait: true
    });
    const preparation: IBackgroundPreparation = {
      envelope: { ...hint.envelope, requestId: `background-prepare-${++this.#preparationCount}` },
      controller: new AbortController()
    };
    this.#preparation = preparation;
    // Requests that arrive now wait behind the transition, with their wait budgets paused while it loads.
    this.#transitioning = true;
    this.#scriptsMayPassTransition = true;
    this.#transitionProgress.setActive(true);
    void this.#runPreparationAsync(hint, preparation, lease);
  }

  /**
   * Reloads the workspace graph and binds the kept command line's engine to it, as the request path does, but never
   * dispatches the command. It takes native Rush's repository lock before it quiesces anything, without waiting.
   * A request that it does not serve stops it at its next step (`#stopPreparationUnlessJoined`).
   */
  async #runPreparationAsync(
    hint: IPreparationHint,
    preparation: IBackgroundPreparation,
    admitted: Promise<IRequestLease>
  ): Promise<void> {
    const { envelope, controller } = preparation;
    const signal: AbortSignal = AbortSignal.any([this.#abortController.signal, controller.signal]);
    const description: string = `"rush ${envelope.argv.join(' ')}" in the background (${envelope.requestId})`;
    const startTimeMs: number = performance.now();
    let lease: IRequestLease | undefined;
    let busy: boolean = false;
    try {
      lease = await admitted;
      signal.throwIfAborted();
      if (this.#restartPending || this.#closing || this.#cleanupFailure !== undefined) return;
      if (this.#detectInstallationChange()) return;
      const session: IWorkspaceSession | undefined = this.#options.provider.currentSession;
      if (session !== hint.session) return;
      const nativeLock: LockFile | undefined = tryAcquireNativeLock(
        session.rushConfiguration.commonTempFolder
      );
      if (!nativeLock) throw new BackgroundPreparationBusyError();
      let lockPassed: boolean = false;
      let result: IReloadResult;
      try {
        result = await this.#reloadAsync(session, envelope, {
          // The resolver keys its parses by this signal, so each preparation needs its own.
          abortSignal: AbortSignal.any([this.#abortController.signal]),
          engineCreationSignal: signal,
          acquireWorkspaceLeaseAsync: (scheduler: RequestScheduler) =>
            scheduler.acquireAsync({
              exclusivityClass: RequestExclusivityClass.Exclusive,
              abortSignal: signal
            }),
          acquireNativeLockAsync: async () => {
            lockPassed = true;
            return nativeLock;
          }
        });
      } finally {
        if (!lockPassed) nativeLock.release();
      }
      this.#preparations.markPrepared();
      this.#preparations.remember(result.session, hint.envelope, result.invalidationSequence);
      const elapsedMs: number = Math.round(performance.now() - startTimeMs);
      this.#options.onLog?.(
        result.selectionRejection
          ? `rushd: loaded the workspace graph for ${description} in ${elapsedMs} ms, but its selection failed: ` +
              result.selectionRejection.message
          : `rushd: prepared ${description} in ${elapsedMs} ms`
      );
    } catch (error) {
      if (error instanceof BackgroundPreparationBusyError || error instanceof PhasedCommandEngineBusyError) {
        busy = true;
      } else if (signal.aborted || error instanceof WorkspaceEngineRecreationRequiredError) {
        const reason: unknown = signal.aborted ? signal.reason : error;
        this.#options.onLog?.(`rushd: stopped preparing ${description}: ${getErrorMessage(reason)}`);
        // Once the daemon is idle, it checks again, on the session that the preparation loaded if it loaded one.
        const current: IWorkspaceSession | undefined = this.#options.provider.currentSession;
        if (current && current !== hint.session && this.#preparations.hint === hint) {
          this.#preparations.remember(current, hint.envelope);
        }
        this.#preparations.defer();
      } else {
        this.#preparations.forget();
        this.#options.onLog?.(`rushd: could not prepare ${description}: ${getErrorMessage(error)}`);
      }
    } finally {
      if (this.#preparation === preparation) this.#preparation = undefined;
      this.#transitioning = false;
      this.#transitionProgress.setActive(false);
      lease?.release();
      if (busy) this.#preparations.retry();
      else this.#preparations.resume(this.#isIdle());
    }
  }

  /**
   * Stops the background preparation at its next step unless `envelope` has the same command line and environment,
   * so that its request can run on the engine that the preparation creates. That request waits behind the
   * preparation as behind any transition. Any other request needs the workspace for something else.
   */
  #stopPreparationUnlessJoined(envelope: IDaemonRequestEnvelope): void {
    const preparation: IBackgroundPreparation | undefined = this.#preparation;
    if (!preparation || this.#canJoinPreparation(preparation.envelope, envelope)) return;
    this.#preparations.defer();
    preparation.controller.abort(new Error(`request ${envelope.requestId} needs the workspace`));
  }

  #canJoinPreparation(prepared: IDaemonRequestEnvelope, envelope: IDaemonRequestEnvelope): boolean {
    return (
      !isRushxInvocation(envelope) &&
      !isGraphRequest(envelope) &&
      !isMutation(envelope) &&
      isSameCommandLine(envelope, prepared) &&
      getCaptureEnvironmentKey(envelope.environment) === this.#preparationEnvironmentKey
    );
  }

  /**
   * Admits a served rushx script with a `#gate` lease, or with a `#scriptPassage` lease while the passage is open. A
   * script that waits behind a transition may be admitted ahead of a reload's owner that still waits for `#gate` (see
   * `#scriptsMayPassTransition`), and passes once the passage opens.
   */
  async #admitScriptAsync(admission: RequestAdmissionController): Promise<IRequestLease> {
    for (;;) {
      if (this.#scriptPassage.isOpen) return await this.#scriptPassage.passAsync(admission);
      if (!this.#transitioning)
        return await admission.acquireAsync(this.#gate, RequestExclusivityClass.SharedBuild);
      const lease: IRequestLease | undefined = await admission.acquireBehindTransitionAsync(
        this.#gate,
        this.#transitionProgress,
        this.#scriptsMayPassTransition,
        this.#scriptPassage.opened
      );
      if (lease) return lease;
    }
  }

  /**
   * Takes native Rush's repository lock for a reload. While another Rush process holds it, served rushx scripts pass
   * the reload (see `#scriptPassage`), and the reload then waits until each of them has started or failed. The
   * requests that still wait behind the reload wait for that process too, and `#transitionProgress` names it.
   */
  async #acquireReloadLockAsync(
    admission: RequestAdmissionController,
    lockFolder: string
  ): Promise<LockFile> {
    const lock: LockFile | undefined = tryAcquireNativeLock(lockFolder);
    if (lock) return lock;
    this.#scriptPassage.open();
    try {
      return await admission.acquireNativeLockAsync(
        () => tryAcquireNativeLock(lockFolder),
        () => findNativeLockHolder(lockFolder),
        this.#transitionProgress
      );
    } finally {
      await this.#scriptPassage.closeAsync();
    }
  }

  /**
   * Waits, while holding `#gate` exclusively, until no served rushx script is running; none can start meanwhile.
   * This is contention, not graph-load progress, so requests queued behind it spend their wait timeouts. The client
   * learns how many scripts still run and, with `restartReason`, why the daemon then restarts; without one, the
   * request is a native mutation, which runs once they exit and then restarts the daemon. `#transitionProgress`
   * records the wait, with `followerReason`, so that the requests queued behind this one can say what they wait for.
   */
  async #waitForServedScriptsAsync(
    admission: RequestAdmissionController,
    restartReason: DaemonRestartReason | undefined,
    followerReason: DaemonRestartReason | undefined = restartReason
  ): Promise<void> {
    const loading: boolean = this.#transitionProgress.active;
    this.#transitionProgress.setActive(false);
    try {
      await admission.waitForServedScriptsAsync(
        this.#scripts,
        restartReason,
        followerReason && { progress: this.#transitionProgress, restartReason: followerReason }
      );
    } finally {
      this.#transitionProgress.setActive(loading);
    }
  }

  async #quiesceWarmSetAsync(session: IWorkspaceSession): Promise<void> {
    this.#forceReload = true;
    try {
      await session.quiesceWarmSetAsync?.();
    } catch (error) {
      this.#cleanupFailure = error;
      throw error;
    }
  }

  /**
   * Whether the session's configuration is known to match the workspace inputs: a reload bound this session after
   * checking that its inputs did not change while it loaded, and they have not changed since. The session that the
   * daemon loads at startup is not checked that way. An edit made after it loaded, while the startup capture runs,
   * is in the startup fingerprint but not in the session. Nor does a session count while a reload is pending, for
   * example after a reload found the Rush lock busy; until a build reloads, a usage error goes to in-process Rush.
   */
  #isConfigurationCurrent(session: IWorkspaceSession, tier: WorkspaceInputChangeTier): boolean {
    return tier === WorkspaceInputChangeTier.Reuse && this.#boundSession === session && !this.#forceReload;
  }

  #captureAsync(
    session: IWorkspaceSession,
    envelope: IDaemonRequestEnvelope,
    notBeforeMs?: number
  ): Promise<IWorkspaceInputFingerprint> {
    const { rushConfiguration } = session;
    const { environment } = envelope;
    return this.#fingerprintCaptures.captureAsync(
      rushConfiguration,
      getCaptureEnvironmentKey(environment),
      () =>
        captureWorkspaceInputFingerprintAsync({
          rushConfiguration,
          environment,
          runtimePaths: this.#runtimePaths,
          runtimeCache: this.#runtimeCache
        }),
      notBeforeMs
    );
  }

  #captureProjectFingerprintAsync(session: IWorkspaceSession, notBeforeMs?: number): Promise<string> {
    const { rushConfiguration } = session;
    return this.#projectFingerprintCaptures.captureAsync(
      rushConfiguration,
      '',
      () => captureProjectConfigurationFingerprintAsync(rushConfiguration, this.#terminal),
      notBeforeMs
    );
  }

  /**
   * Returns undefined, which must not match any fingerprint, if a project's configuration cannot be loaded.
   * Binding a new generation then reports the error, or hands the request to in-process Rush, which loads only
   * the projects that a request selects.
   */
  async #tryCaptureProjectFingerprintAsync(
    session: IWorkspaceSession,
    notBeforeMs?: number
  ): Promise<string | undefined> {
    try {
      return await this.#captureProjectFingerprintAsync(session, notBeforeMs);
    } catch (error) {
      if (error instanceof PhasedCommandEngineProjectConfigurationError) return undefined;
      throw error;
    }
  }

  /**
   * The change that needs a restart may be reverted while the request waits for the restart drain, and requests that
   * do not need a restart can keep the drain from finishing for as long as they keep arriving. The request therefore
   * captures its inputs again while it waits, and stops waiting once they no longer need a restart. A request's
   * environment does not change, so a request that needs a restart for its environment does not capture again.
   */
  #createRestartRecheck(
    session: IWorkspaceSession,
    envelope: IDaemonRequestEnvelope,
    fingerprint: IWorkspaceInputFingerprint,
    mutation: boolean
  ): IWorkspaceRestartRecheck | undefined {
    if (fingerprint.environmentHash !== this.#startupFingerprint.environmentHash) return undefined;
    return {
      intervalMs: RESTART_RECHECK_INTERVAL_MS,
      stillNeedsRestartAsync: async () =>
        this.#classify(await this.#recheckCaptureAsync(session, envelope), mutation) ===
        WorkspaceInputChangeTier.Restart
    };
  }

  /**
   * Every request that waits for a restart drain checks its inputs once per interval, so the waiters share the
   * latest check's capture, whether it still runs or has settled, until it is one interval old. The checks then cost
   * one capture per interval however many requests wait, and each waiter still sees a change within about two
   * intervals. Only requests whose environments match this process's environment check again (see
   * `#createRestartRecheck`), so every waiter of one workspace configuration requests the same capture.
   */
  #recheckCaptureAsync(
    session: IWorkspaceSession,
    envelope: IDaemonRequestEnvelope
  ): Promise<IWorkspaceInputFingerprint> {
    const { rushConfiguration } = session;
    const nowMs: number = performance.now();
    const latest: IRecheckCapture | undefined = this.#recheckCaptures.get(rushConfiguration);
    if (latest && nowMs - latest.startTimeMs < RESTART_RECHECK_INTERVAL_MS) return latest.fingerprint;
    const fingerprint: Promise<IWorkspaceInputFingerprint> = this.#captureAsync(session, envelope);
    this.#recheckCaptures.set(rushConfiguration, { startTimeMs: nowMs, fingerprint });
    return fingerprint;
  }

  /**
   * Says why a request whose inputs need a restart (see `#classify`) needs it, for the request and for rushx scripts
   * that wait for the restart. A request whose environment differs from the daemon's gets the names of the variables
   * that differ, whatever else differs. Otherwise the reason names the files that changed, as the latest capture
   * found them, and the Rush version that the request selects if the daemon does not run it.
   */
  #getRestartReason(
    fingerprint: IWorkspaceInputFingerprint,
    environment: Readonly<Record<string, string | undefined>>,
    mutation: boolean
  ): DaemonRestartReason {
    const environmentReason: DaemonRestartReason | undefined = getEnvironmentRestartReason(
      this.#startupEnvironmentEntries,
      environment
    );
    if (environmentReason) return environmentReason;
    const startup: IWorkspaceInputFingerprint = this.#startupFingerprint;
    const { selectedRushVersion } = fingerprint;
    return {
      kind: 'workspaceInputsChanged',
      ...(!mutation &&
        fingerprint.installationHash !== startup.installationHash && {
          installationFiles: this.#toWorkspacePaths(this.#runtimeCache.changedInstallationPaths)
        }),
      ...(fingerprint.runtimeHash !== startup.runtimeHash && {
        implementationFiles: this.#toWorkspacePaths(
          this.#runtimeCache.changedPaths.slice(0, MAX_REASON_IMPLEMENTATION_FILES)
        )
      }),
      ...((selectedRushVersion !== Rush.version || selectedRushVersion !== this.#options.rushVersion) && {
        selectedRushVersion
      })
    };
  }

  /** Makes the paths inside the workspace relative to its root, with forward slashes. */
  #toWorkspacePaths(filePaths: ReadonlyArray<string>): string[] {
    return filePaths.map((filePath: string) => {
      const relativePath: string = path.relative(this.#repoRoot, filePath);
      return relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
        ? relativePath.split(path.sep).join('/')
        : filePath;
    });
  }

  #classify(fingerprint: IWorkspaceInputFingerprint, mutation: boolean): WorkspaceInputChangeTier {
    if (
      fingerprint.selectedRushVersion !== Rush.version ||
      fingerprint.selectedRushVersion !== this.#options.rushVersion ||
      fingerprint.environmentHash !== this.#startupFingerprint.environmentHash ||
      fingerprint.runtimeHash !== this.#startupFingerprint.runtimeHash ||
      (!mutation && fingerprint.installationHash !== this.#startupFingerprint.installationHash)
    )
      return WorkspaceInputChangeTier.Restart;
    return fingerprint.configurationHash === this.#fingerprint.configurationHash
      ? WorkspaceInputChangeTier.Reuse
      : WorkspaceInputChangeTier.Reload;
  }

  async #restartPlanAsync(
    session: IWorkspaceSession,
    envelope: IDaemonRequestEnvelope,
    reason: IWorkspaceProcessRestartPlan['reason']
  ): Promise<IWorkspaceProcessRestartPlan> {
    const fingerprint: IWorkspaceInputFingerprint = await this.#captureAsync(session, envelope);
    const getLaunchAsync: GetWorkspaceSuccessorLaunchAsync | undefined =
      this.#options.getSuccessorLaunchAsync;
    if (!getLaunchAsync)
      throw new Error(
        `A new daemon process is required (${[
          fingerprint.runtimeHash !== this.#startupFingerprint.runtimeHash
            ? `implementation: ${this.#runtimeCache.changedPaths.slice(0, 3).join(', ')}`
            : '',
          fingerprint.environmentHash !== this.#startupFingerprint.environmentHash ? 'environment' : '',
          fingerprint.installationHash !== this.#startupFingerprint.installationHash ? 'installation' : '',
          fingerprint.selectedRushVersion !== Rush.version ||
          fingerprint.selectedRushVersion !== this.#options.rushVersion
            ? `selected Rush ${fingerprint.selectedRushVersion}; running ${Rush.version}`
            : ''
        ]
          .filter(Boolean)
          .join(', ')}), but this host has no successor launcher. No operation was scheduled or executed.`
      );
    const context: IWorkspaceProcessRestartContext = {
      repoRoot: session.metadata.repoRoot,
      rushVersion: fingerprint.selectedRushVersion,
      environment: Object.freeze({ ...envelope.environment }),
      reason
    };
    const launch: IWorkspaceSuccessorLaunch = await getLaunchAsync(context);
    return { ...context, launch, failure: undefined };
  }

  async #executeMutationAsync(
    generation: IPreparedGeneration,
    envelope: IDaemonRequestEnvelope,
    client: IDaemonRequestDispatchClient,
    state: IExecutionState,
    dispatchAsync: DispatchWorkspaceRequestAsync
  ): Promise<void> {
    let restart: IWorkspaceProcessRestartPlan | undefined;
    let installationChange: IDaemonInstallationChange | undefined;
    // The exit code of a mutation that failed before it changed the installation, as far as the daemon can tell when the
    // worker exits. The worker's processes are joined after that, so the daemon keeps running only if that still holds.
    let keptExitCode: number | undefined;
    const installationBefore: INativeMutationInstallationState | undefined =
      await captureNativeMutationInstallationStateAsync(generation.session.rushConfiguration);
    const planWithoutSuccessor = (
      reason: IWorkspaceProcessRestartPlan['reason'],
      failure: Error | undefined
    ): IWorkspaceProcessRestartPlan => ({
      repoRoot: generation.session.metadata.repoRoot,
      rushVersion: generation.fingerprint.selectedRushVersion,
      environment: Object.freeze({ ...envelope.environment }),
      reason,
      launch: undefined,
      failure
    });
    const prepareRestartAsync: () => Promise<void> = async () => {
      try {
        // A daemon whose installation changed selects no successor, which would run code that is gone or replaced.
        if (!this.#detectInstallationChange())
          restart = await this.#restartPlanAsync(generation.session, envelope, 'native-mutation');
      } catch (error) {
        restart = planWithoutSuccessor(
          'native-mutation',
          error instanceof Error ? error : new Error(String(error))
        );
      }
      // Also when it changed while the successor was selected, or made that fail: each client starts one instead.
      installationChange = this.#detectInstallationChange();
      if (installationChange) restart = planWithoutSuccessor('installation-changed', undefined);
    };
    const resolver: IDaemonRequestResolver = createNativeMutationResolver(
      envelope,
      generation.fingerprint.selectedRushVersion,
      async (context, exitCode: number) => {
        if (
          exitCode !== 0 &&
          (await this.#mayKeepAfterFailedMutationAsync(generation, envelope, installationBefore))
        ) {
          keptExitCode = exitCode;
          return;
        }
        await prepareRestartAsync();
        if (installationChange)
          context.terminal.writeWarningLine(
            `The daemon's installation at ${installationChange.folder} was ${installationChange.change}, so the ` +
              'daemon exits after this command without starting a new one; the next command starts one.'
          );
        else if (restart?.failure)
          context.terminal.writeErrorLine(
            `Mutation completed, but successor startup is unavailable: ${restart.failure.message}`
          );
        generation.session.retire?.();
      }
    );
    try {
      await dispatchAsync({
        envelope,
        client,
        workspaceSession: generation.session,
        resolver,
        onExecutionStarting: () => {
          this.#assertGeneration(generation);
          state.began = true;
        }
      });
    } finally {
      if (
        keptExitCode !== undefined &&
        (await this.#isInstallationUnchangedAfterJoinAsync(generation, installationBefore))
      ) {
        // This daemon is now in the state that a reload which found the Rush lock busy leaves: quiescing the warm set
        // required a reload, so the next request that needs the graph loads it again.
        this.#options.onLog?.(
          `rushd: "rush ${envelope.commandName}" failed (exit code ${keptExitCode}) before it changed the ` +
            'installation, so this daemon keeps running and reloads the workspace for the next request'
        );
      } else if (state.began) {
        if (!restart) await prepareRestartAsync();
        if (!state.resultDrained) {
          restart = {
            ...restart!,
            // Unlike a changed installation, this is a failure that the host reports.
            reason: 'native-mutation',
            launch: undefined,
            failure: new Error(
              'Mutation result could not be drained; stopping without an automatic successor.'
            )
          };
        }
        this.#lastReloadTier = WorkspaceInputChangeTier.Restart;
        this.#closing = true;
        // Requests that are answered from now on retry on the successor, or on the daemon that their client starts.
        this.#restartPending =
          restart!.failure === undefined &&
          (restart!.launch !== undefined || restart!.reason === 'installation-changed');
        generation.session.retire?.();
        this.#options.onRestartRequested(restart!);
      }
    }
  }

  /**
   * Whether a native mutation that failed may keep this daemon: when its worker exited, the installation was as it
   * was before, and the workspace inputs don't require a new daemon process for any other reason.
   */
  async #mayKeepAfterFailedMutationAsync(
    generation: IPreparedGeneration,
    envelope: IDaemonRequestEnvelope,
    installationBefore: INativeMutationInstallationState | undefined
  ): Promise<boolean> {
    try {
      if (!(await this.#isInstallationUnchangedAsync(generation, installationBefore))) return false;
      // Classified as for a build, which also compares the installation files, such as a lockfile that the mutation
      // wrote: a daemon that the next build would restart for its inputs restarts now instead.
      const fingerprint: IWorkspaceInputFingerprint = await this.#captureAsync(generation.session, envelope);
      return (
        this.#classify(fingerprint, false) !== WorkspaceInputChangeTier.Restart &&
        !this.#detectInstallationChange()
      );
    } catch {
      return false;
    }
  }

  /** Whether the installation is still as it was once the worker's processes were joined. */
  async #isInstallationUnchangedAfterJoinAsync(
    generation: IPreparedGeneration,
    installationBefore: INativeMutationInstallationState | undefined
  ): Promise<boolean> {
    try {
      // A worker whose processes could not be joined may still be changing the installation.
      assertWorkspaceRequestResourcesHealthy(generation.session);
      return await this.#isInstallationUnchangedAsync(generation, installationBefore);
    } catch {
      return false;
    }
  }

  /**
   * Whether the files that show a native `install` or `update` changed the installation are as they were before its
   * worker started, and the daemon's own installation did not change.
   */
  async #isInstallationUnchangedAsync(
    generation: IPreparedGeneration,
    installationBefore: INativeMutationInstallationState | undefined
  ): Promise<boolean> {
    if (!installationBefore) return false;
    const installationAfter: INativeMutationInstallationState | undefined =
      await captureNativeMutationInstallationStateAsync(generation.session.rushConfiguration);
    return (
      installationAfter !== undefined &&
      isInstallationUnchangedByMutation(installationBefore, installationAfter) &&
      !this.#detectInstallationChange()
    );
  }

  /**
   * Returns the change when the daemon's installation was removed or replaced. Such a daemon cannot load the rest of
   * its code, so from the first detection on it admits no more requests; each request waits in the restart drain for
   * the requests that the daemon is serving and then gets a restart result instead.
   */
  #detectInstallationChange(): IDaemonInstallationChange | undefined {
    if (this.#installationChange || this.#closing) return this.#installationChange;
    const change: IDaemonInstallationChange | undefined = this.#options.checkInstallation?.();
    if (!change) return undefined;
    this.#installationChange = change;
    this.#cancelObservers();
    this.#preparation?.controller.abort(
      new Error(`the installation at ${change.folder} was ${change.change}`)
    );
    this.#options.onLog?.(
      `rushd: the installation at ${change.folder} was ${change.change}; exiting once running requests finish, ` +
        'so that the next client starts a new daemon'
    );
    return change;
  }

  /**
   * Rejects a command that the resolver never serves before the request waits for admission, so that its client can
   * run the command in-process at once. Otherwise the request would wait, for example behind a build that waits for
   * the running build before it reloads the graph, and could fail when its own wait timeout ran out. The rejection is
   * handled as one after admission: once the installation changed, the request gets the restart result instead.
   */
  #throwIfUnsupportedCommand(envelope: IDaemonRequestEnvelope): void {
    if (isRushxInvocation(envelope) || isDaemonGraphCommand(envelope) || isMutation(envelope)) return;
    const unsupported: DaemonRequestDispatchError | undefined =
      this.#resolver.workspaceLifecycle?.getUnsupportedCommandError?.(envelope);
    if (unsupported) throw unsupported;
  }

  #throwIfInstallationChanged(): void {
    const change: IDaemonInstallationChange | undefined = this.#detectInstallationChange();
    if (change) throw new InstallationChangedBeforeExecution(change);
  }

  /**
   * Answers a request with a restart result once the requests that the daemon is serving finish (the restart drain),
   * so that its client does not wait for this daemon to exit while a long build still runs. The first request to get
   * there asks the host to exit without selecting a successor; each client then starts one with its own launcher.
   */
  async #restartForInstallationAsync(
    envelope: IDaemonRequestEnvelope,
    client: IDaemonRequestDispatchClient,
    admission: RequestAdmissionController,
    ticket: IWorkspaceRestartTicket,
    change: IDaemonInstallationChange
  ): Promise<void> {
    const restartReason: DaemonRestartReason = {
      kind: 'installationChanged',
      change: change.change,
      folder: change.folder
    };
    let lease: IRequestLease;
    try {
      await admission.waitForRestartDrainAsync(this.#restartArbiter, ticket, restartReason);
      lease = await admission.acquireBeforeRestartAsync(this.#gate, restartReason);
    } catch (error) {
      if (!(error instanceof RequestSchedulerError)) throw error;
      await writeAdmissionFailureAsync(envelope, client, error);
      return;
    }
    const restarting: boolean = !this.#restartPending;
    this.#lastReloadTier = WorkspaceInputChangeTier.Restart;
    this.#restartPending = true;
    this.#closing = true;
    try {
      await client.interactiveSession.finishAsync();
      await client.writeResultAsync(
        this.#restartPendingResult(envelope.requestId, new RestartPendingBeforeExecution())
      );
    } finally {
      if (restarting) {
        this.#options.onRestartRequested({
          repoRoot: this.#repoRoot,
          rushVersion: this.#options.rushVersion,
          environment: Object.freeze({ ...envelope.environment }),
          reason: 'installation-changed',
          launch: undefined,
          failure: undefined
        });
      }
      lease.release();
    }
  }

  #restartPendingResult(requestId: string, pending: RestartPendingBeforeExecution): IDaemonCommandResult {
    const change: IDaemonInstallationChange | undefined = this.#installationChange;
    if (!change) {
      const restartReason: IDaemonEnvironmentChangedRestartReason | undefined = this.#restartReason;
      return {
        ...preExecutionFailure(requestId, pending),
        retryAfterRestart: true,
        ...(restartReason && { restartReason })
      };
    }
    return {
      ...preExecutionFailure(requestId, new InstallationChangedBeforeExecution(change)),
      retryAfterRestart: true,
      restartReason: { kind: 'installationChanged', change: change.change, folder: change.folder }
    };
  }

  #assertGeneration(generation: IPreparedGeneration): void {
    assertWorkspaceRequestResourcesHealthy(generation.session);
    generation.session.assertActive?.();
    if (generation.generation !== this.#options.provider.generation) {
      throw new Error(
        'Workspace generation changed before execution. No operation was scheduled or executed.'
      );
    }
  }

  #cancelObservers(): void {
    for (const observer of this.#observers) observer.abort(new Error('Workspace generation is changing.'));
  }

  public [Symbol.asyncDispose](): Promise<void> {
    this.#closing = true;
    this.#preparations.close();
    this.#abortController.abort();
    this.#cancelObservers();
    this.#disposePromise ??= (async () => {
      const lease: IRequestLease = await this.#gate.acquireAsync({
        exclusivityClass: RequestExclusivityClass.Exclusive
      });
      const failures: unknown[] = [];
      try {
        // Served scripts don't hold `#gate`; they were aborted above, so wait for them to stop.
        (await this.#scripts.acquireAsync({ exclusivityClass: RequestExclusivityClass.Exclusive })).release();
        for (const resolver of this.#ownedResolvers) {
          try {
            await resolver[Symbol.asyncDispose]?.();
          } catch (error) {
            failures.push(error);
          }
        }
        this.#ownedResolvers.clear();
        if (this.#cleanupFailure !== undefined && !failures.includes(this.#cleanupFailure)) {
          failures.push(this.#cleanupFailure);
        }
      } finally {
        lease.release();
      }
      if (failures.length === 1) throw failures[0];
      if (failures.length > 1) throw new AggregateError(failures, 'Failed to dispose workspace resolvers.');
    })();
    return this.#disposePromise;
  }
}

function isMutation(envelope: IDaemonRequestEnvelope): boolean {
  return (
    !isRushxInvocation(envelope) &&
    envelope.commandOrigin === 'built-in' &&
    ['install', 'update'].includes(envelope.commandName)
  );
}

function isGraphRequest(envelope: IDaemonRequestEnvelope): boolean {
  return (
    !isRushxInvocation(envelope) && envelope.commandOrigin === 'built-in' && envelope.commandName === 'daemon'
  );
}

function getResolverLifecycle(resolver: IDaemonRequestResolver): IWorkspaceResolverLifecycle {
  if (!resolver.workspaceLifecycle) {
    throw new Error('A generation replacement lost its workspace resolver lifecycle capability.');
  }
  return resolver.workspaceLifecycle;
}

/**
 * Parses the command with the session's configuration. A command line that this configuration rejects fails as
 * native Rush would only if the configuration is current (`isConfigurationCurrent`). Otherwise native Rush might
 * accept the command line, for example with a parameter that experiments.json adds, so the client runs it
 * in-process instead.
 */
async function getCommandParameterIdentityAsync(
  resolver: IDaemonRequestResolver,
  options: IResolveDaemonRequestOptions,
  isConfigurationCurrent: boolean
): Promise<string> {
  try {
    return await getResolverLifecycle(resolver).getCommandParameterIdentityAsync(options);
  } catch (error) {
    if (error instanceof DaemonRequestUsageError && !isConfigurationCurrent) {
      throw new DaemonRequestDispatchError('unsupported', error.message, { cause: error });
    }
    throw error;
  }
}

/**
 * Parses a custom command before the input capture, or returns `undefined` for a usage error or for an environment
 * that differs from the daemon's. The parse after the capture answers a usage error only if the configuration is
 * current (`getCommandParameterIdentityAsync`). The capture classifies an environment that differs, so the daemon
 * restarts for the request, as it does for build; if the capture found no difference, that parse rejects it.
 */
async function tryGetCustomCommandParameterIdentityAsync(
  resolver: IDaemonRequestResolver,
  options: IResolveDaemonRequestOptions
): Promise<string | undefined> {
  try {
    return await getResolverLifecycle(resolver).getCommandParameterIdentityAsync(options);
  } catch (error) {
    if (error instanceof DaemonRequestUsageError || error instanceof DaemonRequestEnvironmentError) {
      return undefined;
    }
    throw error;
  }
}

/** A request rejected as invalid after the resolver bound a graph to the session: its selection failed. */
function isSelectionRejection(
  error: unknown,
  session: IWorkspaceSession
): error is DaemonRequestDispatchError {
  return (
    error instanceof DaemonRequestDispatchError &&
    error.code === 'invalidRequest' &&
    session.operationGraph !== undefined
  );
}

function isGraphWatch(envelope: IDaemonRequestEnvelope): boolean {
  return isGraphRequest(envelope) && envelope.argv[1] === 'graph' && envelope.argv[2] === 'watch';
}

/** Only shared builds honor `returnEarlyOnFailure`, as `PhasedRequestRouter` does. */
function mayContinueAfterResult(
  envelope: IDaemonRequestEnvelope,
  exclusivityClass: RequestExclusivityClass
): boolean {
  return envelope.returnEarlyOnFailure === true && exclusivityClass === RequestExclusivityClass.SharedBuild;
}

/** A rejection after which the client runs the command in-process. */
function isFallbackRejection(error: unknown): error is DaemonRequestDispatchError {
  return error instanceof DaemonRequestDispatchError && error.code === 'unsupported';
}

/**
 * Whether a command that the client runs in-process may run alongside the work that finished requests continue:
 * a rushx script, or a built-in command that only reads the workspace, such as `rush list`.
 *
 * @remarks
 * The client cannot tell a built-in command from a custom one, so it sends every command that the daemon does not
 * serve as a custom command. command-line.json cannot reuse a built-in command's name, so the name identifies one.
 */
function mayFallBackAlongsideContinuingWork(envelope: IDaemonRequestEnvelope): boolean {
  return (
    isRushxInvocation(envelope) ||
    classifyRushCommand({ commandName: envelope.commandName, commandOrigin: 'built-in' }) ===
      RequestExclusivityClass.SharedRead
  );
}

async function writeAdmissionFailureAsync(
  envelope: IDaemonRequestEnvelope,
  client: IDaemonRequestDispatchClient,
  error: RequestSchedulerError
): Promise<void> {
  await client.interactiveSession.finishAsync();
  await client.writeResultAsync({
    ...preExecutionFailure(envelope.requestId, getDaemonShutdownReason(client.abortSignal) ?? error),
    aborted: client.abortSignal.aborted,
    admissionErrorCode: getRequestAdmissionErrorCode(error)
  });
}

function preExecutionFailure(requestId: string, error: Error): IDaemonCommandResult {
  return { requestId, exitCode: 1, outcome: 'failure', aborted: false, errorMessage: error.message };
}

function createLifecycleClient(
  client: IDaemonRequestDispatchClient,
  abortSignal: AbortSignal,
  state: IExecutionState,
  onResultDrained: () => void,
  onRequestExclusivityClass: (exclusivityClass: RequestExclusivityClass) => void
): IDaemonRequestDispatchClient {
  return {
    abortSignal,
    interactiveSession: client.interactiveSession,
    receivedTimeMs: client.receivedTimeMs,
    sessionId: client.sessionId,
    supportsRequestAdmission: client.supportsRequestAdmission,
    getNextEventSequence: () => client.getNextEventSequence(),
    waitForConnectingClientsAsync: async () => await client.waitForConnectingClientsAsync?.(),
    writeEventAsync: (event) => {
      state.began = true;
      return client.writeEventAsync(event);
    },
    writeLogChunkAsync: (operationId, stream, chunk) => {
      state.began = true;
      return client.writeLogChunkAsync(operationId, stream, chunk);
    },
    writeQueuePositionAsync: (message) => client.writeQueuePositionAsync(message),
    writeRequestStartedAsync: client.writeRequestStartedAsync && (() => client.writeRequestStartedAsync!()),
    writeTerminalChunkAsync: (stream, chunk) => {
      state.began = true;
      return client.writeTerminalChunkAsync(stream, chunk);
    },
    writeTerminalPolicyAsync: (result) => {
      state.terminalAttempted = true;
      return client.writeTerminalPolicyAsync(result);
    },
    writeResultAsync: async (result) => {
      state.terminalAttempted = true;
      await client.writeResultAsync(result);
      state.resultDrained = true;
      try {
        onResultDrained();
      } catch (error) {
        // The result was delivered, so this must not turn into a failure to write it.
        process.emitWarning(error instanceof Error ? error : String(error), {
          code: 'RUSH_DAEMON_RESULT_DRAINED_CALLBACK_ERROR'
        });
      }
    },
    onRequestExclusivityClass
  } as IDaemonRequestDispatchClient & {
    readonly onRequestExclusivityClass: (exclusivityClass: RequestExclusivityClass) => void;
  };
}
