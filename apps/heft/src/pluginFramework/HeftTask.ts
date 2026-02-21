// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { InternalError } from '@rushstack/node-core-library';

import { HeftPluginConfiguration } from '../configuration/HeftPluginConfiguration.ts';
import type {
  HeftTaskPluginDefinition,
  HeftPluginDefinitionBase
} from '../configuration/HeftPluginDefinition.ts';
import type { HeftPhase, IHeftPhase } from './HeftPhase.ts';
import type {
  IHeftConfigurationJsonTaskSpecifier,
  IHeftConfigurationJsonPluginSpecifier
} from '../utilities/CoreConfigFiles.ts';
import type { IHeftTaskPlugin } from './IHeftPlugin.ts';
import type { IScopedLogger } from './logging/ScopedLogger.ts';

const RESERVED_TASK_NAMES: Set<string> = new Set(['clean']);

/**
 * @public
 */
export interface IHeftTask {
  readonly parentPhase: IHeftPhase;
  readonly taskName: string;
  readonly consumingTasks: ReadonlySet<IHeftTask>;
  readonly dependencyTasks: ReadonlySet<IHeftTask>;
}

/**
 * @internal
 */
export class HeftTask implements IHeftTask {
  private _parentPhase: HeftPhase;
  private _taskName: string;
  private _taskSpecifier: IHeftConfigurationJsonTaskSpecifier;
  private _consumingTasks: Set<HeftTask> | undefined;
  private _dependencyTasks: Set<HeftTask> | undefined;

  private _taskPluginDefinition: HeftTaskPluginDefinition | undefined;
  private _taskPlugin: IHeftTaskPlugin | undefined;

  public get parentPhase(): HeftPhase {
    return this._parentPhase;
  }

  public get taskName(): string {
    return this._taskName;
  }

  public get consumingTasks(): ReadonlySet<HeftTask> {
    if (!this._consumingTasks) {
      // Force initialize all dependency relationships
      // This needs to operate on every phase in the set because the relationships are only specified
      // in the consuming phase.
      const { tasks } = this._parentPhase;

      for (const task of tasks) {
        task._consumingTasks = new Set();
      }
      for (const task of tasks) {
        for (const dependency of task.dependencyTasks) {
          dependency._consumingTasks!.add(task);
        }
      }
    }

    return this._consumingTasks!;
  }

  public get pluginDefinition(): HeftTaskPluginDefinition {
    if (!this._taskPluginDefinition) {
      throw new InternalError(
        'HeftTask.ensureInitializedAsync() must be called before accessing HeftTask.pluginDefinition.'
      );
    }
    return this._taskPluginDefinition;
  }

  public get pluginOptions(): object | undefined {
    return this._taskSpecifier.taskPlugin.options;
  }

  public get dependencyTasks(): Set<HeftTask> {
    if (!this._dependencyTasks) {
      this._dependencyTasks = new Set();
      const dependencyNamesSet: Set<string> = new Set(this._taskSpecifier.taskDependencies || []);

      for (const dependencyName of dependencyNamesSet) {
        // Skip if we can't find the dependency
        const dependencyTask: HeftTask | undefined = this._parentPhase.tasksByName.get(dependencyName);
        if (!dependencyTask) {
          throw new Error(
            `Could not find dependency task ${JSON.stringify(dependencyName)} within phase ` +
              `${JSON.stringify(this._parentPhase.phaseName)}.`
          );
        }
        this._dependencyTasks.add(dependencyTask);
      }
    }

    return this._dependencyTasks!;
  }

  public constructor(
    parentPhase: HeftPhase,
    taskName: string,
    taskSpecifier: IHeftConfigurationJsonTaskSpecifier
  ) {
    this._parentPhase = parentPhase;
    this._taskName = taskName;
    this._taskSpecifier = taskSpecifier;

    this._validate();
  }

  public async ensureInitializedAsync(): Promise<void> {
    if (!this._taskPluginDefinition) {
      this._taskPluginDefinition = await this._loadTaskPluginDefinitionAsync();
      this.pluginDefinition.validateOptions(this.pluginOptions);
    }
  }

  public async getPluginAsync(logger: IScopedLogger): Promise<IHeftTaskPlugin<object | void>> {
    await this.ensureInitializedAsync();
    if (!this._taskPlugin) {
      this._taskPlugin = await this._taskPluginDefinition!.loadPluginAsync(logger);
    }
    return this._taskPlugin;
  }

  private async _loadTaskPluginDefinitionAsync(): Promise<HeftTaskPluginDefinition> {
    // taskPlugin.pluginPackage should already be resolved to the package root.
    // See CoreConfigFiles.heftConfigFileLoader
    const pluginSpecifier: IHeftConfigurationJsonPluginSpecifier = this._taskSpecifier.taskPlugin;
    const pluginConfiguration: HeftPluginConfiguration = await HeftPluginConfiguration.loadFromPackageAsync(
      pluginSpecifier.pluginPackageRoot,
      pluginSpecifier.pluginPackage
    );
    const pluginDefinition: HeftPluginDefinitionBase =
      pluginConfiguration.getPluginDefinitionBySpecifier(pluginSpecifier);

    const isTaskPluginDefinition: boolean = pluginConfiguration.isTaskPluginDefinition(pluginDefinition);
    if (!isTaskPluginDefinition) {
      throw new Error(
        `Plugin ${JSON.stringify(pluginSpecifier.pluginName)} specified by task ` +
          `${JSON.stringify(this._taskName)} is not a task plugin.`
      );
    }
    return pluginDefinition;
  }

  private _validate(): void {
    if (RESERVED_TASK_NAMES.has(this.taskName)) {
      throw new Error(
        `Task name ${JSON.stringify(this.taskName)} is reserved and cannot be used as a task name.`
      );
    }
    if (!this._taskSpecifier.taskPlugin) {
      throw new Error(`Task ${JSON.stringify(this.taskName)} has no specified task plugin.`);
    }
  }
}
