// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AsyncParallelHook } from 'tapable';

import { HeftTaskSession, type IHeftTaskCleanHookOptions } from './HeftTaskSession';
import { HeftPluginHost } from './HeftPluginHost';
import { ScopedLogger } from './logging/ScopedLogger';
import type { IInternalHeftSessionOptions } from './InternalHeftSession';
import type { MetricsCollector } from '../metrics/MetricsCollector';
import type { HeftPhase } from './HeftPhase';
import type { HeftTask } from './HeftTask';
import type { IHeftTaskPlugin } from './IHeftPlugin';
import type { LoggingManager } from './logging/LoggingManager';
import type { HeftParameterManager } from './HeftParameterManager';

export interface IHeftPhaseSessionOptions extends IInternalHeftSessionOptions {
  phase: HeftPhase;
  parameterManager: HeftParameterManager;
}

export class HeftPhaseSession extends HeftPluginHost {
  public readonly cleanHook: AsyncParallelHook<IHeftTaskCleanHookOptions>;
  public readonly loggingManager: LoggingManager;
  public readonly metricsCollector: MetricsCollector;
  public readonly phaseLogger: ScopedLogger;
  public readonly cleanLogger: ScopedLogger;

  private readonly _options: IHeftPhaseSessionOptions;
  private readonly _taskSessionsByTask: Map<HeftTask, HeftTaskSession> = new Map();

  public constructor(options: IHeftPhaseSessionOptions) {
    super();
    this._options = options;
    this.metricsCollector = options.metricsCollector;
    this.loggingManager = options.loggingManager;

    // Create and own the clean hook, to be shared across all task sessions.
    this.cleanHook = new AsyncParallelHook(['cleanHookOptions']);
    this.phaseLogger = this.loggingManager.requestScopedLogger(options.phase.phaseName);
    this.cleanLogger = this.loggingManager.requestScopedLogger(`${options.phase.phaseName}:clean`);
  }

  /**
   * Get a task session for the given task.
   */
  public getSessionForTask(task: HeftTask): HeftTaskSession {
    let taskSession: HeftTaskSession | undefined = this._taskSessionsByTask.get(task);
    if (!taskSession) {
      taskSession = new HeftTaskSession({
        ...this._options,
        task,
        taskParameters: this._options.parameterManager.getParametersForPlugin(task.pluginDefinition),
        // Each task session will share the clean hook but have its own run hook
        cleanHook: this.cleanHook,
        pluginHost: this
      });
      this._taskSessionsByTask.set(task, taskSession);
    }
    return taskSession;
  }

  /**
   * Apply all task plugins specified by the phase.
   */
  protected async applyPluginsInternalAsync(): Promise<void> {
    const {
      heftConfiguration,
      phase: { tasks }
    } = this._options;

    // Load up all plugins concurrently
    const loadPluginPromises: Promise<IHeftTaskPlugin<object | void>>[] = [];
    for (const task of tasks) {
      const taskSession: HeftTaskSession = this.getSessionForTask(task);
      loadPluginPromises.push(task.getPluginAsync(taskSession.logger));
    }

    // Promise.all maintains the order of the input array
    const plugins: IHeftTaskPlugin<object | void>[] = await Promise.all(loadPluginPromises);

    // Iterate through and apply the plugins
    let pluginIndex: number = 0;
    for (const task of tasks) {
      const taskSession: HeftTaskSession = this.getSessionForTask(task);
      const taskPlugin: IHeftTaskPlugin<object | void> = plugins[pluginIndex++];
      try {
        taskPlugin.apply(taskSession, heftConfiguration, task.pluginOptions);
      } catch (error) {
        throw new Error(
          `Error applying plugin ${JSON.stringify(task.pluginDefinition.pluginName)} from package ` +
            `${JSON.stringify(task.pluginDefinition.pluginPackageName)}: ${error}`
        );
      }
    }

    // Do a second pass to apply the plugin access requests for each plugin
    pluginIndex = 0;
    for (const task of tasks) {
      const taskPlugin: IHeftTaskPlugin<object | void> = plugins[pluginIndex++];
      this.resolvePluginAccessRequests(taskPlugin, task.pluginDefinition);
    }
  }
}
