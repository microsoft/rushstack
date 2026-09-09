// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import {
  captureProjectConfigurationFingerprintAsync,
  captureWorkspaceInputFingerprintAsync,
  classifyWorkspaceInputChange,
  EnvironmentVariableNames,
  PhasedCommandEngineBusyError,
  Rush,
  WorkspaceInputChangeTier,
  WorkspaceRuntimeFingerprintCache,
  type IWorkspaceInputFingerprint
} from '@microsoft/rush-lib';
import { LockFile } from '@rushstack/node-core-library';
import { NoOpTerminalProvider, Terminal } from '@rushstack/terminal';
import type { IDaemonCommandResult, IDaemonRequestEnvelope } from '@rushstack/rush-daemon-protocol';

import {
  DaemonRequestDispatchError,
  type DispatchWorkspaceRequestAsync,
  type IDaemonRequestDispatchClient,
  type IDaemonRequestLifecycle,
  type IDaemonRequestResolver
} from './DaemonRequestDispatcher';
import { createNativeMutationResolver } from './NativeMutationRequest';
import { parseDaemonGraphRequest, type IDaemonGraphRequest } from './DaemonGraphRequest';
import { isRushxInvocation, type IWorkspaceResolverLifecycle } from './WorkspaceResolverLifecycle';
import {
  RequestExclusivityClass,
  RequestScheduler,
  RequestSchedulerError,
  type IRequestLease
} from './RequestScheduler';
import {
  RequestAdmissionController,
  getRequestAdmissionErrorCode,
  getWorkspaceRequestScheduler
} from './WorkspaceRequestAdmission';
import { WorkspaceEngineRecreationRequiredError } from './WorkspaceEngineComponentFactory';
import type { IWorkspaceSession } from './WorkspaceSession';
import type { WorkspaceSessionProvider } from './WorkspaceSessionProvider';
import { assertWorkspaceRequestResourcesHealthy } from './WorkspaceRequestResources';
import type {
  GetWorkspaceSuccessorLaunchAsync,
  IWorkspaceProcessRestartContext,
  IWorkspaceProcessRestartPlan,
  IWorkspaceSuccessorLaunch
} from './WorkspaceProcessRestart';

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

export interface IWorkspaceRequestLifecycleOptions {
  readonly provider: WorkspaceSessionProvider;
  readonly resolver: IDaemonRequestResolver;
  readonly rushVersion: string;
  readonly getSuccessorLaunchAsync: GetWorkspaceSuccessorLaunchAsync | undefined;
  readonly onRestartRequested: (plan: IWorkspaceProcessRestartPlan) => void;
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

/**
 * Generation admission composes the existing request schedulers, native locks and session provider.
 * It never releases a resolved request onto a different session, and never replays scheduled work.
 */
export class WorkspaceRequestLifecycle implements IDaemonRequestLifecycle {
  readonly #options: IWorkspaceRequestLifecycleOptions;
  readonly #gate: RequestScheduler = new RequestScheduler();
  readonly #abortController: AbortController = new AbortController();
  readonly #observers: Set<AbortController> = new Set();
  readonly #terminal: Terminal = new Terminal(new NoOpTerminalProvider());
  readonly #runtimePaths: ReadonlyArray<string> = [__dirname, path.resolve(__dirname, '../package.json')];
  readonly #startupFingerprint: IWorkspaceInputFingerprint;
  readonly #runtimeCache: WorkspaceRuntimeFingerprintCache;
  #fingerprint: IWorkspaceInputFingerprint;
  #projectFingerprint: string | undefined;
  #commandIdentity: string | undefined;
  #resolver: IDaemonRequestResolver;
  readonly #ownedResolvers: Set<IDaemonRequestResolver> = new Set();
  #boundSession: IWorkspaceSession | undefined;
  #forceReload: boolean = false;
  #closing: boolean = false;
  #restartPending: boolean = false;
  #lastReloadTier: WorkspaceInputChangeTier = WorkspaceInputChangeTier.Reuse;
  #transitioning: boolean = false;
  #cleanupFailure: unknown;
  #disposePromise: Promise<void> | undefined;

  private constructor(
    options: IWorkspaceRequestLifecycleOptions,
    fingerprint: IWorkspaceInputFingerprint,
    runtimeCache: WorkspaceRuntimeFingerprintCache
  ) {
    this.#options = options;
    this.#startupFingerprint = this.#fingerprint = fingerprint;
    this.#resolver = options.resolver;
    this.#ownedResolvers.add(options.resolver);
    this.#runtimeCache = runtimeCache;
  }

  public static async createAsync(
    options: IWorkspaceRequestLifecycleOptions
  ): Promise<WorkspaceRequestLifecycle> {
    const session: IWorkspaceSession = await options.provider.getSessionAsync();
    const runtimeCache: WorkspaceRuntimeFingerprintCache = new WorkspaceRuntimeFingerprintCache();
    const fingerprint: IWorkspaceInputFingerprint = await captureWorkspaceInputFingerprintAsync({
      rushConfiguration: session.rushConfiguration,
      environment: process.env,
      runtimePaths: [__dirname, path.resolve(__dirname, '../package.json')],
      runtimeCache
    });
    return new WorkspaceRequestLifecycle(options, fingerprint, runtimeCache);
  }

  /** The last applied input decision; reading status never changes or reloads the workspace. */
  public get lastReloadTier(): WorkspaceInputChangeTier {
    return this.#lastReloadTier;
  }

  public async dispatchAsync(
    request: IDaemonRequestEnvelope,
    destination: IDaemonRequestDispatchClient,
    dispatchAsync: DispatchWorkspaceRequestAsync
  ): Promise<void> {
    // Native Rush owns its SDK handoff; a foreign client's bundled engine must not override this one.
    const envelope: IDaemonRequestEnvelope = {
      ...request,
      environment: {
        ...request.environment,
        [EnvironmentVariableNames._RUSH_LIB_PATH]: require.resolve('@microsoft/rush-lib')
      }
    };
    if (this.#restartPending) {
      await destination.interactiveSession.finishAsync();
      await destination.writeResultAsync({
        ...preExecutionFailure(envelope.requestId, new RestartPendingBeforeExecution()),
        retryAfterRestart: true
      });
      return;
    }
    if (this.#closing)
      throw new Error('The workspace lifecycle is closing. No operation was scheduled or executed.');
    if (this.#cleanupFailure !== undefined) throw this.#cleanupFailure;
    const state: IExecutionState = { began: false, terminalAttempted: false, resultDrained: false };
    const observer: AbortController | undefined = isGraphWatch(envelope) ? new AbortController() : undefined;
    if (observer) this.#observers.add(observer);
    const signal: AbortSignal = AbortSignal.any([
      destination.abortSignal,
      this.#abortController.signal,
      ...(observer ? [observer.signal] : [])
    ]);
    const client: IDaemonRequestDispatchClient = createLifecycleClient(destination, signal, state);
    const admission: RequestAdmissionController = new RequestAdmissionController({
      admission: envelope.admission,
      client,
      requestId: envelope.requestId
    });
    let generation: IPreparedGeneration | undefined;
    try {
      for (let attempt: number = 0; ; attempt++) {
        try {
          generation = await this.#prepareAsync(envelope, client, admission);
          const requestEnvelope: IDaemonRequestEnvelope = {
            ...envelope,
            admission: admission.remainingAdmission
          };
          if (isMutation(envelope)) {
            await this.#executeMutationAsync(generation, requestEnvelope, client, state, dispatchAsync);
          } else {
            await dispatchAsync({
              envelope: requestEnvelope,
              client,
              workspaceSession: generation.session,
              resolver: generation.resolver,
              onExecutionStarting: () => {
                this.#assertGeneration(generation!);
                state.began = true;
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
            try {
              await client.interactiveSession.finishAsync();
              await client.writeResultAsync({
                ...preExecutionFailure(envelope.requestId, error),
                retryAfterRestart: true
              });
              error.session.retire?.();
              this.#lastReloadTier = WorkspaceInputChangeTier.Restart;
              this.#restartPending = true;
              this.#closing = true;
              this.#options.onRestartRequested(error.plan);
            } finally {
              error.workspaceLease.release();
              error.lease.release();
            }
            return;
          }
          if (error instanceof RestartPendingBeforeExecution && !state.began && !state.terminalAttempted) {
            await client.interactiveSession.finishAsync();
            await client.writeResultAsync({
              ...preExecutionFailure(envelope.requestId, error),
              retryAfterRestart: true
            });
            return;
          }
          if (error instanceof RequestSchedulerError && !state.began && !state.terminalAttempted) {
            await client.interactiveSession.finishAsync();
            await client.writeResultAsync({
              ...preExecutionFailure(envelope.requestId, error),
              aborted: client.abortSignal.aborted,
              admissionErrorCode: getRequestAdmissionErrorCode(error)
            });
            return;
          }
          throw error;
        } finally {
          generation?.lease.release();
          generation = undefined;
        }
      }
    } finally {
      admission.dispose();
      if (observer) this.#observers.delete(observer);
    }
  }

  async #prepareAsync(
    envelope: IDaemonRequestEnvelope,
    client: IDaemonRequestDispatchClient,
    admission: RequestAdmissionController,
    admittedLease?: IRequestLease
  ): Promise<IPreparedGeneration> {
    let lease: IRequestLease =
      admittedLease ?? (await admission.acquireAsync(this.#gate, RequestExclusivityClass.SharedBuild));
    let ownsTransition: boolean = false;
    try {
      if (this.#restartPending) throw new RestartPendingBeforeExecution();
      if (this.#closing)
        throw new Error('The workspace is restarting. No operation was scheduled or executed.');
      if (this.#cleanupFailure !== undefined) throw this.#cleanupFailure;
      let session: IWorkspaceSession = await this.#options.provider.getSessionAsync();
      assertWorkspaceRequestResourcesHealthy(session);
      if (isRushxInvocation(envelope)) {
        return {
          session,
          resolver: this.#resolver,
          generation: this.#options.provider.generation,
          lease,
          fingerprint: this.#fingerprint
        };
      }
      if (isGraphRequest(envelope)) {
        const graphRequest: IDaemonGraphRequest = parseDaemonGraphRequest(envelope);
        if (session.operationGraph && !['show', 'status', 'watch'].includes(graphRequest.verb)) {
          // Graph control environment flags are not a request to change the retained engine environment.
          const controlEnvelope: IDaemonRequestEnvelope = {
            ...envelope,
            environment: Object.fromEntries(
              Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
            )
          };
          const current: IWorkspaceInputFingerprint = await this.#captureAsync(session, controlEnvelope);
          const currentTier: WorkspaceInputChangeTier = this.#classify(current, false);
          if (currentTier === WorkspaceInputChangeTier.Restart) {
            lease.release();
            this.#cancelObservers();
            lease = await admission.acquireAsync(this.#gate, RequestExclusivityClass.Exclusive);
            session = await this.#options.provider.getSessionAsync();
            await this.#quiesceWarmSetAsync(session);
            const workspaceLease: IRequestLease = await admission.acquireAsync(
              getWorkspaceRequestScheduler(session),
              RequestExclusivityClass.Exclusive
            );
            try {
              const plan: IWorkspaceProcessRestartPlan = await this.#restartPlanAsync(
                session,
                controlEnvelope,
                'hard-input-change'
              );
              throw new RestartBeforeExecution(plan, session, lease, workspaceLease);
            } catch (error) {
              if (!(error instanceof RestartBeforeExecution)) workspaceLease.release();
              throw error;
            }
          }
          if (
            currentTier !== WorkspaceInputChangeTier.Reuse ||
            (this.#boundSession &&
              this.#projectFingerprint !==
                (await captureProjectConfigurationFingerprintAsync(
                  session.rushConfiguration,
                  this.#terminal
                )))
          ) {
            throw new Error(
              'Graph inputs changed. Load the new generation with a supported build request; no operation was scheduled or executed.'
            );
          }
        }
        return {
          session,
          resolver: this.#resolver,
          generation: this.#options.provider.generation,
          lease,
          fingerprint: this.#fingerprint
        };
      }
      if (
        envelope.commandOrigin !== 'built-in' ||
        !['build', 'rebuild', 'install', 'update'].includes(envelope.commandName)
      ) {
        return {
          session,
          resolver: this.#resolver,
          generation: this.#options.provider.generation,
          lease,
          fingerprint: this.#fingerprint
        };
      }
      let fingerprint: IWorkspaceInputFingerprint = await this.#captureAsync(session, envelope);
      let tier: WorkspaceInputChangeTier = this.#classify(fingerprint, isMutation(envelope));
      let commandIdentity: string | undefined;
      let projectFingerprint: string | undefined;
      if (tier !== WorkspaceInputChangeTier.Restart && !isMutation(envelope)) {
        commandIdentity = await getResolverLifecycle(this.#resolver).getCommandParameterIdentityAsync({
          envelope,
          workspaceSession: session,
          abortSignal: client.abortSignal
        });
        if (tier === WorkspaceInputChangeTier.Reuse) {
          projectFingerprint = await captureProjectConfigurationFingerprintAsync(
            session.rushConfiguration,
            this.#terminal
          );
          if (
            this.#boundSession !== session ||
            this.#commandIdentity !== commandIdentity ||
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
        return {
          session,
          resolver: this.#resolver,
          generation: this.#options.provider.generation,
          lease,
          fingerprint
        };
      }

      lease.release();
      if (this.#transitioning) {
        const shared: IRequestLease = await admission.acquireAsync(
          this.#gate,
          RequestExclusivityClass.SharedBuild
        );
        return await this.#prepareAsync(envelope, client, admission, shared);
      }
      this.#transitioning = ownsTransition = true;
      this.#cancelObservers();
      lease = await admission.acquireAsync(this.#gate, RequestExclusivityClass.Exclusive);
      if (this.#restartPending) throw new RestartPendingBeforeExecution();
      if (this.#closing)
        throw new Error('The workspace is restarting. No operation was scheduled or executed.');
      session = await this.#options.provider.getSessionAsync();
      fingerprint = await this.#captureAsync(session, envelope);
      tier = this.#classify(fingerprint, isMutation(envelope));
      if (tier === WorkspaceInputChangeTier.Restart) {
        await this.#quiesceWarmSetAsync(session);
        const workspaceLease: IRequestLease = await admission.acquireAsync(
          getWorkspaceRequestScheduler(session),
          RequestExclusivityClass.Exclusive
        );
        try {
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
      if (isMutation(envelope)) {
        if (!this.#options.getSuccessorLaunchAsync) {
          throw new DaemonRequestDispatchError(
            'unsupported',
            'Native mutations require a successor launcher. No worker was started.'
          );
        }
        await this.#quiesceWarmSetAsync(session);
        return {
          session,
          resolver: this.#resolver,
          generation: this.#options.provider.generation,
          lease,
          fingerprint
        };
      }

      commandIdentity = await getResolverLifecycle(this.#resolver).getCommandParameterIdentityAsync({
        envelope,
        workspaceSession: session,
        abortSignal: client.abortSignal
      });
      if (
        this.#boundSession === session &&
        this.#commandIdentity === commandIdentity &&
        tier === WorkspaceInputChangeTier.Reuse &&
        !this.#forceReload &&
        session.invalidations.getSnapshot().isWatcherHealthy &&
        !session.invalidations.hasUnattributedUnknownChanges
      ) {
        projectFingerprint = await captureProjectConfigurationFingerprintAsync(
          session.rushConfiguration,
          this.#terminal
        );
        if (projectFingerprint === this.#projectFingerprint) {
          this.#lastReloadTier = WorkspaceInputChangeTier.Reuse;
          this.#gate.downgradeExclusiveLease(lease, RequestExclusivityClass.SharedBuild);
          return {
            session,
            resolver: this.#resolver,
            generation: this.#options.provider.generation,
            lease,
            fingerprint
          };
        }
      }
      await this.#quiesceWarmSetAsync(session);
      const workspaceLease: IRequestLease = await admission.acquireAsync(
        getWorkspaceRequestScheduler(session),
        RequestExclusivityClass.Exclusive
      );
      const nativeLock: LockFile | undefined = LockFile.tryAcquire(
        session.rushConfiguration.commonTempFolder,
        'rush'
      );
      if (!nativeLock) {
        workspaceLease.release();
        throw new PhasedCommandEngineBusyError();
      }
      try {
        const before: IWorkspaceInputFingerprint = await this.#captureAsync(session, envelope);
        let expectedFingerprint: IWorkspaceInputFingerprint = before;
        const validationContext: { session?: IWorkspaceSession } = {};
        const previousResolver: IDaemonRequestResolver = this.#resolver;
        const resolver: IDaemonRequestResolver = getResolverLifecycle(previousResolver).createForSession(
          nativeLock,
          async () => {
            const replacementSession: IWorkspaceSession | undefined = validationContext.session;
            if (!replacementSession) throw new Error('The replacement generation is not initialized.');
            const current: IWorkspaceInputFingerprint = await this.#captureAsync(
              replacementSession,
              envelope
            );
            if (
              classifyWorkspaceInputChange(expectedFingerprint, current) !== WorkspaceInputChangeTier.Reuse
            ) {
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
        await resolver.resolveRequestAsync({
          envelope,
          workspaceSession: session,
          abortSignal: client.abortSignal
        });
        const after: IWorkspaceInputFingerprint = await this.#captureAsync(session, envelope);
        if (classifyWorkspaceInputChange(before, after) !== WorkspaceInputChangeTier.Reuse) {
          this.#forceReload = true;
          throw new WorkspaceEngineRecreationRequiredError();
        }
        this.#resolver = resolver;
        expectedFingerprint = after;
        this.#boundSession = session;
        this.#fingerprint = after;
        this.#projectFingerprint = await captureProjectConfigurationFingerprintAsync(
          session.rushConfiguration,
          this.#terminal
        );
        this.#commandIdentity = await getResolverLifecycle(resolver).getCommandParameterIdentityAsync({
          envelope,
          workspaceSession: session,
          abortSignal: client.abortSignal
        });
        this.#lastReloadTier = WorkspaceInputChangeTier.Reload;
        this.#forceReload = false;
        fingerprint = after;
      } catch (error) {
        this.#forceReload = true;
        if (error instanceof AggregateError) this.#cleanupFailure = error;
        throw error;
      } finally {
        nativeLock.release();
        workspaceLease.release();
      }
      this.#gate.downgradeExclusiveLease(lease, RequestExclusivityClass.SharedBuild);
      return {
        session,
        resolver: this.#resolver,
        generation: this.#options.provider.generation,
        lease,
        fingerprint
      };
    } catch (error) {
      if (!(error instanceof RestartBeforeExecution)) lease.release();
      throw error;
    } finally {
      if (ownsTransition) this.#transitioning = false;
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

  #captureAsync(
    session: IWorkspaceSession,
    envelope: IDaemonRequestEnvelope
  ): Promise<IWorkspaceInputFingerprint> {
    return captureWorkspaceInputFingerprintAsync({
      rushConfiguration: session.rushConfiguration,
      environment: envelope.environment,
      runtimePaths: this.#runtimePaths,
      runtimeCache: this.#runtimeCache
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
    const prepareRestartAsync: () => Promise<void> = async () => {
      try {
        restart = await this.#restartPlanAsync(generation.session, envelope, 'native-mutation');
      } catch (error) {
        restart = {
          repoRoot: generation.session.metadata.repoRoot,
          rushVersion: generation.fingerprint.selectedRushVersion,
          environment: Object.freeze({ ...envelope.environment }),
          reason: 'native-mutation',
          launch: undefined,
          failure: error instanceof Error ? error : new Error(String(error))
        };
      }
    };
    const resolver: IDaemonRequestResolver = createNativeMutationResolver(
      envelope,
      generation.fingerprint.selectedRushVersion,
      async (context) => {
        await prepareRestartAsync();
        if (restart?.failure)
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
      if (state.began) {
        if (!restart) await prepareRestartAsync();
        if (!state.resultDrained) {
          restart = {
            ...restart!,
            launch: undefined,
            failure: new Error(
              'Mutation result could not be drained; stopping without an automatic successor.'
            )
          };
        }
        this.#lastReloadTier = WorkspaceInputChangeTier.Restart;
        this.#closing = true;
        this.#restartPending = restart!.launch !== undefined && restart!.failure === undefined;
        generation.session.retire?.();
        this.#options.onRestartRequested(restart!);
      }
    }
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
    this.#abortController.abort();
    this.#cancelObservers();
    this.#disposePromise ??= (async () => {
      const lease: IRequestLease = await this.#gate.acquireAsync({
        exclusivityClass: RequestExclusivityClass.Exclusive
      });
      const failures: unknown[] = [];
      try {
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

function isGraphWatch(envelope: IDaemonRequestEnvelope): boolean {
  return isGraphRequest(envelope) && envelope.argv[1] === 'graph' && envelope.argv[2] === 'watch';
}

function preExecutionFailure(requestId: string, error: Error): IDaemonCommandResult {
  return { requestId, exitCode: 1, outcome: 'failure', aborted: false, errorMessage: error.message };
}

function createLifecycleClient(
  client: IDaemonRequestDispatchClient,
  abortSignal: AbortSignal,
  state: IExecutionState
): IDaemonRequestDispatchClient {
  return {
    abortSignal,
    interactiveSession: client.interactiveSession,
    sessionId: client.sessionId,
    supportsRequestAdmission: client.supportsRequestAdmission,
    getNextEventSequence: () => client.getNextEventSequence(),
    writeEventAsync: (event) => {
      state.began = true;
      return client.writeEventAsync(event);
    },
    writeLogChunkAsync: (operationId, stream, chunk) => {
      state.began = true;
      return client.writeLogChunkAsync(operationId, stream, chunk);
    },
    writeQueuePositionAsync: (message) => client.writeQueuePositionAsync(message),
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
    }
  };
}
