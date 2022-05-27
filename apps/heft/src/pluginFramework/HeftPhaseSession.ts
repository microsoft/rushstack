// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AsyncParallelHook } from 'tapable';
import { Async } from '@rushstack/node-core-library';

import { Constants } from '../utilities/Constants';
import { HeftTaskSession, IHeftTaskCleanHookOptions } from './HeftTaskSession';
import { HeftPluginHost } from './HeftPluginHost';
import type { IInternalHeftSessionOptions } from './InternalHeftSession';
import type { MetricsCollector } from '../metrics/MetricsCollector';
import type { HeftPhase } from './HeftPhase';
import type { HeftTask } from './HeftTask';
import type { IHeftTaskPlugin } from './IHeftPlugin';
import type { LoggingManager } from './logging/LoggingManager';

/**
 * @internal
 */
export interface IHeftPhaseSessionOptions extends IInternalHeftSessionOptions {
  /**
   * @beta
   */
  phase: HeftPhase;
}

/**
 * @internal
 */
export class HeftPhaseSession extends HeftPluginHost {
  private readonly _options: IHeftPhaseSessionOptions;
  private readonly _taskSessionsByName: Map<string, HeftTaskSession> = new Map();

  /**
   * @beta
   */
  public readonly cleanHook: AsyncParallelHook<IHeftTaskCleanHookOptions>;

  /**
   * @beta
   */
  public readonly loggingManager: LoggingManager;

  /**
   * @beta
   */
  public readonly metricsCollector: MetricsCollector;

  /**
   * @internal
   */
  public constructor(options: IHeftPhaseSessionOptions) {
    super();
    this._options = options;
    this.metricsCollector = options.metricsCollector;
    this.loggingManager = options.loggingManager;

    // Create and own the clean hook, to be shared across all task sessions.
    this.cleanHook = new AsyncParallelHook(['cleanHookOptions']);
  }

  public getSessionForTask(task: HeftTask): HeftTaskSession {
    let taskSession: HeftTaskSession | undefined = this._taskSessionsByName.get(task.taskName);
    if (!taskSession) {
      taskSession = new HeftTaskSession({
        ...this._options,
        logger: this._options.loggingManager.requestScopedLogger(
          `${task.parentPhase.phaseName}:${task.taskName}`
        ),
        taskHooks: {
          // Each task session will share the clean hook but have its own run hook
          clean: this.cleanHook,
          run: new AsyncParallelHook(['runHookOptions'])
        },
        parametersByLongName: new Map([...task.pluginDefinition.parameters].map((x) => [x.longName, x])),
        requestAccessToPluginByName: this.getRequestAccessToPluginByNameFn(task.taskName),
        task
      });
      this._taskSessionsByName.set(task.taskName, taskSession);
    }
    return taskSession;
  }

  public async applyPluginsAsync(): Promise<void> {
    await Async.forEachAsync(
      this._options.phase.tasks,
      async (task: HeftTask) => {
        try {
          const taskSession: HeftTaskSession = this.getSessionForTask(task);
          const taskPlugin: IHeftTaskPlugin<object | void> = await task.getPluginAsync(taskSession.logger);
          taskPlugin.apply(taskSession, this._options.heftConfiguration, task.pluginOptions);
        } catch (error) {
          throw new Error(
            `Error applying plugin "${task.pluginDefinition.pluginName}" from package ` +
              `"${task.pluginDefinition.pluginPackageName}": ${error}`
          );
        }
      },
      { concurrency: Constants.maxParallelism }
    );

    // Do a second pass to apply the plugin hooks that were requested by plugins
    await Async.forEachAsync(
      this._options.phase.tasks,
      async (task: HeftTask) => {
        const taskSession: HeftTaskSession = this.getSessionForTask(task);
        const taskPlugin: IHeftTaskPlugin<object | void> = await task.getPluginAsync(taskSession.logger);
        await this.applyPluginHooksAsync(taskPlugin, task.pluginDefinition);
      },
      { concurrency: Constants.maxParallelism }
    );
  }
}
