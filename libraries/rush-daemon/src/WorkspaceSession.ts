// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { PhasedCommandEngineBusyError, RushConfiguration } from '@microsoft/rush-lib';
import type { IInputsSnapshot, IOperationGraph, RushSession } from '@microsoft/rush-lib';

import { WorkspaceInvalidationTracker } from './WorkspaceInvalidationTracker';
import { WorkspaceSessionFileWatcher } from './WorkspaceSessionFileWatcher';
import type {
  IWorkspaceEngineShape,
  IWorkspaceInvalidationReconciliation
} from './WorkspaceEngineComponentFactory';

/**
 * Stable identity loaded once for a warm workspace session.
 *
 * @beta
 */
export interface IWorkspaceSessionMetadata {
  readonly projectCount: number;
  readonly projectNames: ReadonlyArray<string>;
  readonly repoRoot: string;
  readonly rushJsonFile: string;
  readonly rushVersion: string;
}

/**
 * A headless watcher that reports changes independently of connected clients.
 *
 * @beta
 */
export interface IWorkspaceInvalidationWatcher extends AsyncDisposable {
  startAsync(onInvalidation: (changedPath?: string) => void): Promise<void>;
}

/**
 * Optional engine state supplied when reusable graph construction is available.
 *
 * @remarks
 * A session can supply components at creation or bind its command-dependent engine on the first request.
 *
 * @beta
 */
export interface IWorkspaceSessionComponents extends AsyncDisposable {
  /** Acquire once for graph reconciliation/execution, not separately for each merged client. */
  readonly acquireExecutionLeaseAsync?: () => Promise<AsyncDisposable>;
  readonly engineShape?: IWorkspaceEngineShape;
  readonly inputsSnapshot?: IInputsSnapshot;
  readonly operationGraph?: IOperationGraph;
  /**
   * An injected watcher owned by this component bundle.
   *
   * @remarks
   * When provided, the component bundle's async disposer must dispose the watcher.
   * `WorkspaceSession` directly disposes only the default watcher that it creates itself.
   */
  readonly projectWatcher?: IWorkspaceInvalidationWatcher;
  readonly reconcileInvalidationsAsync?: () => Promise<IWorkspaceInvalidationReconciliation>;
  readonly rushSession?: RushSession;
}

/**
 * Context for constructing optional reusable workspace engine components.
 *
 * @beta
 */
export interface ICreateWorkspaceSessionComponentsOptions {
  readonly invalidations: WorkspaceInvalidationTracker;
  readonly onError?: (error: Error) => void;
  readonly rushConfiguration: RushConfiguration;
}

/**
 * Constructs optional reusable graph, plugin, snapshot, and watcher state.
 *
 * @beta
 */
export type CreateWorkspaceSessionComponentsAsync = (
  options: ICreateWorkspaceSessionComponentsOptions
) => Promise<IWorkspaceSessionComponents>;

/**
 * Options for initializing a workspace session.
 *
 * @beta
 */
export interface IWorkspaceSessionOptions {
  readonly createComponentsAsync?: CreateWorkspaceSessionComponentsAsync;
  readonly onError?: (error: Error) => void;
  readonly repoRoot: string;
  readonly rushVersion: string;
}

/**
 * The reusable state owned by one daemon lifecycle.
 *
 * @beta
 */
export interface IWorkspaceSession extends AsyncDisposable {
  /** Optional execution lease retained through the coalesced iteration's output and resource cleanup. */
  acquireExecutionLeaseAsync?(): Promise<AsyncDisposable | undefined>;
  readonly engineShape: IWorkspaceEngineShape | undefined;
  readonly inputsSnapshot: IInputsSnapshot | undefined;
  readonly invalidations: WorkspaceInvalidationTracker;
  readonly metadata: IWorkspaceSessionMetadata;
  readonly operationGraph: IOperationGraph | undefined;
  readonly rushConfiguration: RushConfiguration;
  readonly rushSession: RushSession | undefined;
  /** Binds the first command-dependent engine, if this session supports lazy engine initialization. */
  initializeEngineAsync?(factory: CreateWorkspaceSessionComponentsAsync): Promise<void>;
  reconcileInvalidationsAsync(): Promise<IWorkspaceInvalidationReconciliation | undefined>;
}

/**
 * Factory used by the daemon host to initialize its workspace session.
 *
 * @beta
 */
export type WorkspaceSessionFactory = (options: IWorkspaceSessionOptions) => Promise<IWorkspaceSession>;

const EMPTY_WORKSPACE_SESSION_COMPONENTS: IWorkspaceSessionComponents = {
  [Symbol.asyncDispose]: () => Promise.resolve()
};

/**
 * A warm workspace session with client-independent invalidation tracking.
 *
 * @beta
 */
export class WorkspaceSession implements IWorkspaceSession {
  #components: IWorkspaceSessionComponents;
  readonly #sessionOwnedProjectWatcher: IWorkspaceInvalidationWatcher | undefined;
  #disposePromise: Promise<void> | undefined;
  #inputsSnapshot: IInputsSnapshot | undefined;
  #isDisposing: boolean = false;
  #engineInitialization: Promise<void> | undefined;

  public readonly invalidations: WorkspaceInvalidationTracker;
  public readonly metadata: IWorkspaceSessionMetadata;
  public readonly rushConfiguration: RushConfiguration;

  private constructor(
    rushConfiguration: RushConfiguration,
    metadata: IWorkspaceSessionMetadata,
    invalidations: WorkspaceInvalidationTracker,
    components: IWorkspaceSessionComponents,
    sessionOwnedProjectWatcher: IWorkspaceInvalidationWatcher | undefined
  ) {
    this.rushConfiguration = rushConfiguration;
    this.metadata = metadata;
    this.invalidations = invalidations;
    this.#components = components;
    this.#sessionOwnedProjectWatcher = sessionOwnedProjectWatcher;
    this.#inputsSnapshot = components.inputsSnapshot;
  }

  public get operationGraph(): IOperationGraph | undefined {
    return this.#components.operationGraph;
  }

  public get rushSession(): RushSession | undefined {
    return this.#components.rushSession;
  }

  public get engineShape(): IWorkspaceEngineShape | undefined {
    return this.#components.engineShape;
  }

  public get inputsSnapshot(): IInputsSnapshot | undefined {
    return this.#inputsSnapshot;
  }

  /** Installs one all-project engine without replacing the watcher or losing retained invalidations. */
  public async initializeEngineAsync(factory: CreateWorkspaceSessionComponentsAsync): Promise<void> {
    if (this.#isDisposing) throw new Error('The workspace session is being disposed.');
    if (!this.#engineInitialization) {
      if (this.#components !== EMPTY_WORKSPACE_SESSION_COMPONENTS) {
        throw new Error('Workspace components have already been supplied.');
      }
      const initialization: Promise<void> = this.#initializeEngineAsync(factory);
      this.#engineInitialization = initialization;
      void initialization.catch((error: unknown) => {
        if (
          error instanceof PhasedCommandEngineBusyError &&
          this.#engineInitialization === initialization &&
          !this.#isDisposing
        ) {
          this.#engineInitialization = undefined;
        }
      });
    }
    await this.#engineInitialization;
  }

  public async acquireExecutionLeaseAsync(): Promise<AsyncDisposable | undefined> {
    if (this.#isDisposing) throw new Error('The workspace session is being disposed.');
    return await this.#components.acquireExecutionLeaseAsync?.();
  }

  async #initializeEngineAsync(factory: CreateWorkspaceSessionComponentsAsync): Promise<void> {
    const components: IWorkspaceSessionComponents = await factory({
      invalidations: this.invalidations,
      rushConfiguration: this.rushConfiguration
    });
    if (this.#isDisposing || components.projectWatcher) {
      await components[Symbol.asyncDispose]();
      throw new Error('Cannot install engine components after disposal or replace the session watcher.');
    }
    this.#components = components;
    this.#inputsSnapshot = components.inputsSnapshot;
  }

  /** Loads workspace identity, creates reusable components, and starts headless invalidation tracking. */
  public static async createAsync(options: IWorkspaceSessionOptions): Promise<WorkspaceSession> {
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
      path.join(options.repoRoot, 'rush.json')
    );
    const canonicalRepoRoot: string = path.resolve(options.repoRoot);
    if (path.resolve(rushConfiguration.rushJsonFolder) !== canonicalRepoRoot) {
      throw new Error(`Rush configuration resolved outside the daemon workspace: ${options.repoRoot}`);
    }

    const invalidations: WorkspaceInvalidationTracker = new WorkspaceInvalidationTracker();
    const components: IWorkspaceSessionComponents =
      (await options.createComponentsAsync?.({
        invalidations,
        onError: options.onError,
        rushConfiguration
      })) ?? EMPTY_WORKSPACE_SESSION_COMPONENTS;
    let projectWatcher: IWorkspaceInvalidationWatcher | undefined = components.projectWatcher;
    let sessionOwnedProjectWatcher: IWorkspaceInvalidationWatcher | undefined;
    try {
      const metadata: IWorkspaceSessionMetadata = createMetadata(rushConfiguration, options.rushVersion);
      if (!projectWatcher) {
        projectWatcher = new WorkspaceSessionFileWatcher({
          onError: (error: Error) => {
            invalidations.markWatcherUnhealthy();
            options.onError?.(error);
          },
          rushConfiguration
        });
        sessionOwnedProjectWatcher = projectWatcher;
      }
      const session: WorkspaceSession = new WorkspaceSession(
        rushConfiguration,
        metadata,
        invalidations,
        components,
        sessionOwnedProjectWatcher
      );
      await projectWatcher.startAsync((changedPath: string | undefined) =>
        invalidations.invalidate(changedPath)
      );
      // Changes before the watcher registered its callbacks cannot be observed path-by-path.
      invalidations.invalidateForInitialization();
      return session;
    } catch (error) {
      const cleanupErrors: unknown[] = [];
      try {
        await sessionOwnedProjectWatcher?.[Symbol.asyncDispose]();
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
      try {
        await components[Symbol.asyncDispose]();
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          [error, ...cleanupErrors],
          'Failed to initialize and clean up the workspace session.'
        );
      }
      throw error;
    }
  }

  /** Stops invalidation tracking and disposes injected engine resources. */
  public [Symbol.asyncDispose](): Promise<void> {
    this.#isDisposing = true;
    this.#disposePromise ??= this.#disposeOnceAsync();
    return this.#disposePromise;
  }

  /** Reconciles retained watcher changes with injected reusable engine state, when configured. */
  public async reconcileInvalidationsAsync(): Promise<IWorkspaceInvalidationReconciliation | undefined> {
    if (this.#isDisposing) {
      throw new Error('The workspace session is being disposed.');
    }
    if (!this.#components.reconcileInvalidationsAsync) {
      return undefined;
    }
    const result: IWorkspaceInvalidationReconciliation = await this.#components.reconcileInvalidationsAsync();
    this.#inputsSnapshot = result.inputsSnapshot;
    return result;
  }

  async #disposeOnceAsync(): Promise<void> {
    // Initialization failures belong to the request. Any successfully constructed components are
    // disposed by initialization itself if shutdown won the race.
    await this.#engineInitialization?.catch(() => undefined);
    let watcherError: unknown;
    try {
      await this.#sessionOwnedProjectWatcher?.[Symbol.asyncDispose]();
    } catch (error) {
      watcherError = error;
    }

    try {
      await this.#components[Symbol.asyncDispose]();
    } catch (componentError) {
      if (watcherError !== undefined) {
        throw new AggregateError(
          [watcherError, componentError],
          'Failed to dispose workspace session resources.'
        );
      }
      throw componentError;
    }
    if (watcherError !== undefined) {
      throw watcherError;
    }
  }
}

function createMetadata(
  rushConfiguration: RushConfiguration,
  rushVersion: string
): IWorkspaceSessionMetadata {
  const projectNames: string[] = Array.from(
    rushConfiguration.projects,
    (project) => project.packageName
  ).sort();
  return {
    projectCount: projectNames.length,
    projectNames,
    repoRoot: rushConfiguration.rushJsonFolder,
    rushJsonFile: rushConfiguration.rushJsonFile,
    rushVersion
  };
}
