// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { RushConfiguration } from '@microsoft/rush-lib';
import type {
  IInputsSnapshot,
  IOperationGraph,
  RushSession
} from '@microsoft/rush-lib';

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
 * The default session intentionally leaves the graph, plugin session, and inputs snapshot uninitialized.
 * Their existing construction is command-specific and remains blocked on the reusable runner lifetime work.
 *
 * @beta
 */
export interface IWorkspaceSessionComponents extends AsyncDisposable {
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
  readonly engineShape: IWorkspaceEngineShape | undefined;
  readonly inputsSnapshot: IInputsSnapshot | undefined;
  readonly invalidations: WorkspaceInvalidationTracker;
  readonly metadata: IWorkspaceSessionMetadata;
  readonly operationGraph: IOperationGraph | undefined;
  readonly rushConfiguration: RushConfiguration;
  readonly rushSession: RushSession | undefined;
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
  readonly #components: IWorkspaceSessionComponents;
  readonly #sessionOwnedProjectWatcher: IWorkspaceInvalidationWatcher | undefined;
  #disposePromise: Promise<void> | undefined;
  #inputsSnapshot: IInputsSnapshot | undefined;
  #isDisposing: boolean = false;

  public readonly invalidations: WorkspaceInvalidationTracker;
  public readonly metadata: IWorkspaceSessionMetadata;
  public readonly operationGraph: IOperationGraph | undefined;
  public readonly rushConfiguration: RushConfiguration;
  public readonly rushSession: RushSession | undefined;

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
    this.operationGraph = components.operationGraph;
    this.rushSession = components.rushSession;
  }

  public get engineShape(): IWorkspaceEngineShape | undefined {
    return this.#components.engineShape;
  }

  public get inputsSnapshot(): IInputsSnapshot | undefined {
    return this.#inputsSnapshot;
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
      const metadata: IWorkspaceSessionMetadata = createMetadata(
        rushConfiguration,
        options.rushVersion
      );
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
    const result: IWorkspaceInvalidationReconciliation =
      await this.#components.reconcileInvalidationsAsync();
    this.#inputsSnapshot = result.inputsSnapshot;
    return result;
  }

  async #disposeOnceAsync(): Promise<void> {
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
