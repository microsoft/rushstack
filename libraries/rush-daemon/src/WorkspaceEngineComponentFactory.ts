// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type {
  GetInputsSnapshotAsyncFn,
  IInputsSnapshot,
  IOperationGraph,
  Operation,
  RushConfiguration,
  RushConfigurationProject,
  RushSession
} from '@microsoft/rush-lib';

import type {
  CreateWorkspaceSessionComponentsAsync,
  ICreateWorkspaceSessionComponentsOptions,
  IWorkspaceSessionComponents
} from './WorkspaceSession';
import type {
  IWorkspaceInvalidationSnapshot,
  WorkspaceInvalidationTracker
} from './WorkspaceInvalidationTracker';

const INVALIDATION_REASON: 'workspace-inputs-changed' = 'workspace-inputs-changed';

/**
 * The command-dependent phase and plugin shape used to construct a reusable engine graph.
 *
 * @remarks
 * The complete shape must be supplied by the integration that owns command/plugin initialization.
 * Rush does not currently expose a command-independent "all phases and plugins" shape.
 *
 * @beta
 */
export interface IWorkspaceEngineShape {
  readonly phaseNames: ReadonlyArray<string>;
  readonly pluginNames: ReadonlyArray<string>;
}

/**
 * Context for constructing real reusable Rush engine components.
 *
 * @beta
 */
export interface ICreateWorkspaceEngineComponentsOptions extends IWorkspaceEngineShape {
  /** Every project in the loaded Rush configuration. */
  readonly projectSelection: ReadonlySet<RushConfigurationProject>;
  readonly rushConfiguration: RushConfiguration;
}

/**
 * Real Rush engine state constructed by the command/plugin integration.
 *
 * @beta
 */
export interface IWorkspaceEngineComponents extends AsyncDisposable {
  /**
   * Stops the graph lifetime and awaits all iteration, runner, plugin, and snapshot resources.
   *
   * @remarks
   * The engine owner must implement this because the public `IOperationGraph` API does not
   * currently expose one deterministic shutdown operation.
   */
  [Symbol.asyncDispose](): Promise<void>;
  readonly getInputsSnapshotAsync: GetInputsSnapshotAsyncFn;
  readonly inputsSnapshot: IInputsSnapshot;
  readonly operationGraph: IOperationGraph;
  readonly rushSession: RushSession;
}

/**
 * Constructs reusable Rush engine state for an explicit graph shape.
 *
 * @beta
 */
export type CreateWorkspaceEngineComponentsAsync = (
  options: ICreateWorkspaceEngineComponentsOptions
) => Promise<IWorkspaceEngineComponents>;

/**
 * Context for mapping watcher paths onto operations in a constructed graph.
 *
 * @beta
 */
export interface IMapWorkspaceInvalidationsOptions {
  readonly changedPaths: ReadonlyArray<string>;
  readonly currentInputsSnapshot: IInputsSnapshot;
  readonly nextInputsSnapshot: IInputsSnapshot;
  readonly operationGraph: IOperationGraph;
}

/**
 * Context for identifying changes that require a new workspace engine.
 *
 * @beta
 */
export interface IClassifyWorkspaceInvalidationsOptions {
  readonly changedPaths: ReadonlyArray<string>;
  readonly rushConfiguration: RushConfiguration;
}

/**
 * Identifies integration-specific graph inputs that cannot be reconciled against an existing graph.
 *
 * @remarks
 * Rush configuration files and project package manifests are classified automatically. Use this callback
 * for plugin-specific graph inputs outside those locations.
 *
 * @beta
 */
export type IsWorkspaceEngineRecreationRequiredAsync = (
  options: IClassifyWorkspaceInvalidationsOptions
) => Promise<boolean>;

/**
 * Maps path-specific watcher invalidations onto operations in the reusable graph.
 *
 * @remarks
 * Unknown changes and unhealthy watcher state bypass this callback and invalidate the full graph.
 *
 * @beta
 */
export type MapWorkspaceInvalidationsToOperationsAsync = (
  options: IMapWorkspaceInvalidationsOptions
) => Promise<Iterable<Operation>>;

/**
 * The result of reconciling retained watcher invalidations with the engine snapshot.
 *
 * @beta
 */
export interface IWorkspaceInvalidationReconciliation {
  readonly inputsSnapshot: IInputsSnapshot;
  readonly invalidatedOperationCount: number;
  readonly isFullInvalidation: boolean;
  readonly sequence: number;
}

/**
 * Indicates that retained changes require the owning workspace session to be recreated.
 *
 * @remarks
 * The invalidations remain unacknowledged. Callers must not execute the existing operation graph after
 * receiving this error.
 *
 * @beta
 */
export class WorkspaceEngineRecreationRequiredError extends Error {
  public constructor() {
    super('Workspace changes require the reusable engine and session to be recreated.');
    this.name = 'WorkspaceEngineRecreationRequiredError';
  }
}

/**
 * Options for {@link WorkspaceEngineComponentFactory}.
 *
 * @beta
 */
export interface IWorkspaceEngineComponentFactoryOptions {
  readonly createEngineComponentsAsync: CreateWorkspaceEngineComponentsAsync;
  readonly isEngineRecreationRequiredAsync?: IsWorkspaceEngineRecreationRequiredAsync;
  readonly mapInvalidationsToOperationsAsync: MapWorkspaceInvalidationsToOperationsAsync;
  readonly shape: IWorkspaceEngineShape;
}

interface IWorkspaceEngineLifecycleOptions {
  readonly components: IWorkspaceEngineComponents;
  readonly graphDefiningPaths: IGraphDefiningPaths;
  readonly invalidations: WorkspaceInvalidationTracker;
  readonly isEngineRecreationRequiredAsync: IsWorkspaceEngineRecreationRequiredAsync | undefined;
  readonly mapInvalidationsToOperationsAsync: MapWorkspaceInvalidationsToOperationsAsync;
  readonly rushConfiguration: RushConfiguration;
}

interface IGraphDefiningPaths {
  readonly filePaths: ReadonlySet<string>;
  readonly folderPaths: ReadonlyArray<string>;
}

class WorkspaceEngineLifecycle {
  readonly #components: IWorkspaceEngineComponents;
  readonly #graphDefiningPaths: IGraphDefiningPaths;
  readonly #invalidations: WorkspaceInvalidationTracker;
  readonly #isEngineRecreationRequiredAsync: IsWorkspaceEngineRecreationRequiredAsync | undefined;
  readonly #mapInvalidationsToOperationsAsync: MapWorkspaceInvalidationsToOperationsAsync;
  readonly #rushConfiguration: RushConfiguration;
  #currentInputsSnapshot: IInputsSnapshot;
  #disposePromise: Promise<void> | undefined;
  #isDisposing: boolean = false;
  #reconciliationTail: Promise<void> = Promise.resolve();
  #requiresFullInvalidation: boolean = false;

  public constructor(options: IWorkspaceEngineLifecycleOptions) {
    this.#components = options.components;
    this.#graphDefiningPaths = options.graphDefiningPaths;
    this.#currentInputsSnapshot = options.components.inputsSnapshot;
    this.#invalidations = options.invalidations;
    this.#isEngineRecreationRequiredAsync = options.isEngineRecreationRequiredAsync;
    this.#mapInvalidationsToOperationsAsync = options.mapInvalidationsToOperationsAsync;
    this.#rushConfiguration = options.rushConfiguration;
  }

  public get inputsSnapshot(): IInputsSnapshot {
    return this.#currentInputsSnapshot;
  }

  public reconcileInvalidationsAsync(): Promise<IWorkspaceInvalidationReconciliation> {
    if (this.#isDisposing) {
      return Promise.reject(new Error('The workspace engine is being disposed.'));
    }

    const reconciliationPromise: Promise<IWorkspaceInvalidationReconciliation> =
      this.#reconciliationTail.then(() => this.#reconcileOnceAsync());
    this.#reconciliationTail = reconciliationPromise.then(
      () => undefined,
      () => undefined
    );
    return reconciliationPromise;
  }

  public [Symbol.asyncDispose](): Promise<void> {
    this.#isDisposing = true;
    this.#disposePromise ??= this.#disposeOnceAsync();
    return this.#disposePromise;
  }

  async #reconcileOnceAsync(): Promise<IWorkspaceInvalidationReconciliation> {
    const invalidationSnapshot: IWorkspaceInvalidationSnapshot = this.#invalidations.getSnapshot();
    if (await this.#requiresEngineRecreationAsync(invalidationSnapshot)) {
      throw new WorkspaceEngineRecreationRequiredError();
    }
    const isFullInvalidation: boolean =
      this.#requiresFullInvalidation ||
      invalidationSnapshot.hasUnknownChanges ||
      !invalidationSnapshot.isWatcherHealthy;
    if (!isFullInvalidation && invalidationSnapshot.changedPaths.length === 0) {
      return {
        inputsSnapshot: this.#currentInputsSnapshot,
        invalidatedOperationCount: 0,
        isFullInvalidation: false,
        sequence: invalidationSnapshot.sequence
      };
    }

    const nextInputsSnapshot: IInputsSnapshot | undefined =
      await this.#components.getInputsSnapshotAsync();
    if (!nextInputsSnapshot) {
      throw new Error('Rush could not capture the next workspace inputs snapshot.');
    }

    const operationGraph: IOperationGraph = this.#components.operationGraph;
    let invalidatedOperationCount: number;
    if (isFullInvalidation) {
      operationGraph.invalidateOperations(undefined, INVALIDATION_REASON);
      invalidatedOperationCount = operationGraph.operations.size;
    } else {
      const mappedOperations: Iterable<Operation> =
        await this.#mapInvalidationsToOperationsAsync({
          changedPaths: invalidationSnapshot.changedPaths,
          currentInputsSnapshot: this.#currentInputsSnapshot,
          nextInputsSnapshot,
          operationGraph
        });
      const invalidatedOperations: ReadonlySet<Operation> = validateMappedOperations(
        mappedOperations,
        operationGraph
      );
      operationGraph.invalidateOperations(invalidatedOperations, INVALIDATION_REASON);
      invalidatedOperationCount = invalidatedOperations.size;
    }

    this.#currentInputsSnapshot = nextInputsSnapshot;
    this.#invalidations.acknowledgeThrough(invalidationSnapshot.sequence);
    this.#requiresFullInvalidation =
      this.#invalidations.getSnapshot().sequence > invalidationSnapshot.sequence;
    return {
      inputsSnapshot: nextInputsSnapshot,
      invalidatedOperationCount,
      isFullInvalidation,
      sequence: invalidationSnapshot.sequence
    };
  }

  async #disposeOnceAsync(): Promise<void> {
    await this.#reconciliationTail;
    await this.#components[Symbol.asyncDispose]();
  }

  async #requiresEngineRecreationAsync(
    invalidationSnapshot: IWorkspaceInvalidationSnapshot
  ): Promise<boolean> {
    if (
      invalidationSnapshot.changedPaths.length === 0 &&
      !invalidationSnapshot.hasUnknownChanges &&
      invalidationSnapshot.isWatcherHealthy
    ) {
      return false;
    }
    if (
      this.#invalidations.hasUnattributedUnknownChanges ||
      !invalidationSnapshot.isWatcherHealthy
    ) {
      return true;
    }

    if (
      invalidationSnapshot.changedPaths.some((changedPath: string) =>
        isBuiltInGraphDefiningPath(
          changedPath,
          this.#rushConfiguration.rushJsonFolder,
          this.#graphDefiningPaths
        )
      )
    ) {
      return true;
    }

    return (
      (await this.#isEngineRecreationRequiredAsync?.({
        changedPaths: invalidationSnapshot.changedPaths,
        rushConfiguration: this.#rushConfiguration
      })) ?? false
    );
  }
}

/**
 * Adapts an explicitly shaped, all-project Rush engine into warm workspace session components.
 *
 * @remarks
 * The factory deliberately does not construct phased hooks or load plugins itself. Those choices remain
 * command-specific in Rush today, so their owner must provide the complete shape and construction callback.
 *
 * @beta
 */
export class WorkspaceEngineComponentFactory {
  readonly #createEngineComponentsAsync: CreateWorkspaceEngineComponentsAsync;
  readonly #isEngineRecreationRequiredAsync: IsWorkspaceEngineRecreationRequiredAsync | undefined;
  readonly #mapInvalidationsToOperationsAsync: MapWorkspaceInvalidationsToOperationsAsync;

  public readonly createAsync: CreateWorkspaceSessionComponentsAsync;
  public readonly shape: IWorkspaceEngineShape;

  public constructor(options: IWorkspaceEngineComponentFactoryOptions) {
    this.#createEngineComponentsAsync = options.createEngineComponentsAsync;
    this.#isEngineRecreationRequiredAsync = options.isEngineRecreationRequiredAsync;
    this.#mapInvalidationsToOperationsAsync = options.mapInvalidationsToOperationsAsync;
    this.shape = normalizeShape(options.shape);
    this.createAsync = (createOptions: ICreateWorkspaceSessionComponentsOptions) =>
      this.#createAsync(createOptions);
  }

  async #createAsync(
    options: ICreateWorkspaceSessionComponentsOptions
  ): Promise<IWorkspaceSessionComponents> {
    const projects: ReadonlySet<RushConfigurationProject> = new Set(options.rushConfiguration.projects);
    const graphDefiningPaths: IGraphDefiningPaths = createGraphDefiningPaths(
      options.rushConfiguration
    );
    const components: IWorkspaceEngineComponents = await this.#createEngineComponentsAsync({
      phaseNames: this.shape.phaseNames,
      pluginNames: this.shape.pluginNames,
      projectSelection: projects,
      rushConfiguration: options.rushConfiguration
    });

    try {
      validateComponents(components, options.rushConfiguration, this.shape);
    } catch (error) {
      await disposeAfterInitializationFailureAsync(components, error);
    }

    const lifecycle: WorkspaceEngineLifecycle = new WorkspaceEngineLifecycle({
      components,
      graphDefiningPaths,
      invalidations: options.invalidations,
      isEngineRecreationRequiredAsync: this.#isEngineRecreationRequiredAsync,
      mapInvalidationsToOperationsAsync: this.#mapInvalidationsToOperationsAsync,
      rushConfiguration: options.rushConfiguration
    });
    return {
      [Symbol.asyncDispose]: () => lifecycle[Symbol.asyncDispose](),
      engineShape: this.shape,
      get inputsSnapshot(): IInputsSnapshot {
        return lifecycle.inputsSnapshot;
      },
      operationGraph: components.operationGraph,
      reconcileInvalidationsAsync: () => lifecycle.reconcileInvalidationsAsync(),
      rushSession: components.rushSession
    };
  }
}

function createGraphDefiningPaths(rushConfiguration: RushConfiguration): IGraphDefiningPaths {
  const filePaths: Set<string> = new Set([path.resolve(rushConfiguration.rushJsonFile)]);
  for (const project of rushConfiguration.projects) {
    filePaths.add(path.join(project.projectFolder, 'package.json'));
    filePaths.add(path.join(project.projectFolder, 'config', 'rush-project.json'));
  }
  return {
    filePaths,
    folderPaths: [
      path.resolve(rushConfiguration.commonRushConfigFolder),
      ...Array.from(rushConfiguration.subspaces, (subspace) =>
        path.resolve(subspace.getSubspaceConfigFolderPath())
      )
    ]
  };
}

function isBuiltInGraphDefiningPath(
  changedPath: string,
  rushJsonFolder: string,
  graphDefiningPaths: IGraphDefiningPaths
): boolean {
  const absoluteChangedPath: string = path.resolve(rushJsonFolder, changedPath);
  if (graphDefiningPaths.filePaths.has(absoluteChangedPath)) {
    return true;
  }
  for (const folderPath of graphDefiningPaths.folderPaths) {
    if (isPathInside(absoluteChangedPath, folderPath)) {
      return true;
    }
  }
  return false;
}

function isPathInside(candidatePath: string, folderPath: string): boolean {
  const relativePath: string = path.relative(path.resolve(folderPath), candidatePath);
  return (
    relativePath === '' ||
    (!path.isAbsolute(relativePath) &&
      relativePath !== '..' &&
      !relativePath.startsWith(`..${path.sep}`))
  );
}

function normalizeShape(shape: IWorkspaceEngineShape): IWorkspaceEngineShape {
  return Object.freeze({
    phaseNames: normalizeNames(shape.phaseNames, 'phase', true),
    pluginNames: normalizeNames(shape.pluginNames, 'plugin', false)
  });
}

function normalizeNames(
  names: ReadonlyArray<string>,
  kind: string,
  requireNonempty: boolean
): ReadonlyArray<string> {
  if (requireNonempty && names.length === 0) {
    throw new Error(`The workspace engine ${kind} shape must not be empty.`);
  }

  const normalizedNames: Set<string> = new Set();
  for (const name of names) {
    if (name.length === 0 || name.trim() !== name) {
      throw new Error(`Invalid workspace engine ${kind} name: "${name}".`);
    }
    if (normalizedNames.has(name)) {
      throw new Error(`Duplicate workspace engine ${kind} name: "${name}".`);
    }
    normalizedNames.add(name);
  }
  return Object.freeze(Array.from(normalizedNames).sort());
}

function validateComponents(
  components: IWorkspaceEngineComponents,
  rushConfiguration: RushConfiguration,
  shape: IWorkspaceEngineShape
): void {
  const operations: ReadonlySet<Operation> = components.operationGraph.operations;
  if (operations.size === 0) {
    throw new Error('The reusable workspace operation graph must not be empty.');
  }

  const configuredProjects: ReadonlySet<RushConfigurationProject> = new Set(
    rushConfiguration.projects
  );
  const representedProjects: Set<RushConfigurationProject> = new Set();
  const phaseNames: ReadonlySet<string> = new Set(shape.phaseNames);
  for (const operation of operations) {
    if (!configuredProjects.has(operation.associatedProject)) {
      throw new Error(
        `Operation "${operation.associatedPhase.name}" uses a project outside the loaded Rush configuration.`
      );
    }
    if (!phaseNames.has(operation.associatedPhase.name)) {
      throw new Error(
        `Operation phase "${operation.associatedPhase.name}" is not declared in the workspace engine shape.`
      );
    }
    representedProjects.add(operation.associatedProject);
  }
  for (const project of configuredProjects) {
    if (!representedProjects.has(project)) {
      throw new Error(
        `The reusable workspace operation graph does not represent project "${project.packageName}".`
      );
    }
  }
}

function validateMappedOperations(
  operations: Iterable<Operation>,
  operationGraph: IOperationGraph
): ReadonlySet<Operation> {
  const validatedOperations: Set<Operation> = new Set();
  for (const operation of operations) {
    if (!operationGraph.operations.has(operation)) {
      throw new Error('The workspace invalidation mapper returned an operation outside the graph.');
    }
    validatedOperations.add(operation);
  }
  return validatedOperations;
}

async function disposeAfterInitializationFailureAsync(
  components: IWorkspaceEngineComponents,
  initializationError: unknown
): Promise<never> {
  try {
    await components[Symbol.asyncDispose]();
  } catch (cleanupError) {
    throw new AggregateError(
      [initializationError, cleanupError],
      'Failed to validate and clean up reusable workspace engine components.'
    );
  }
  throw initializationError;
}
