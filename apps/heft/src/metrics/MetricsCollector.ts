// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import { AsyncParallelHook } from 'tapable';
import { performance } from 'perf_hooks';
import { InternalError } from '@rushstack/node-core-library';

/**
 * @public
 */
export interface IMetricsData {
  /**
   * The command that was executed.
   */
  command: string;

  /**
   * Whether or not the command ran into errors
   */
  encounteredError?: boolean;

  /**
   * The amount of time the command took to execute, in milliseconds.
   */
  taskTotalExecutionMs: number;

  /**
   * The name of the operating system provided by NodeJS.
   */
  machineOs: string;

  /**
   * The processor's architecture.
   */
  machineArch: string;

  /**
   * The number of processor cores.
   */
  machineCores: number;

  /**
   * The processor's model name.
   */
  machineProcessor: string;

  /**
   * The total amount of memory the machine has, in megabytes.
   */
  machineTotalMemoryMB: number;

  /**
   * A map of commandline parameter names to their effective values
   */
  commandParameters: Record<string, string>;
}

/**
 * @public
 */
export interface IHeftRecordMetricsHookOptions {
  /**
   * @public
   */
  metricName: string;

  /**
   * @public
   */
  metricData: IMetricsData;
}

/**
 * @internal
 */
export interface IPerformanceData {
  taskTotalExecutionMs: number;
  encounteredError?: boolean;
}

/**
 * A simple performance metrics collector. A plugin is required to pipe data anywhere.
 *
 * @internal
 */
export interface IMetricsCollector {
  readonly recordMetricsHook: AsyncParallelHook<IHeftRecordMetricsHookOptions>;

  /**
   * Start metrics log timer.
   */
  setStartTime(): void;

  /**
   * Record metrics to the installed plugin(s).
   *
   * @param command - Describe the user command, e.g. `start` or `build`
   * @param parameterMap - Optional map of parameters to their values
   * @param performanceData - Optional performance data
   */
  recordAsync(
    command: string,
    performanceData?: Partial<IPerformanceData>,
    parameters?: Record<string, string>
  ): Promise<void>;
}

/**
 * {@inheritDoc IMetricsCollector}
 */
export class MetricsCollector implements IMetricsCollector {
  public readonly recordMetricsHook: AsyncParallelHook<IHeftRecordMetricsHookOptions> =
    new AsyncParallelHook<IHeftRecordMetricsHookOptions>(['recordMetricsHookOptions']);

  private _startTimeMs: number | undefined;

  /**
   * {@inheritdoc IMetricsCollector.setStartTime}
   */
  public setStartTime(): void {
    this._startTimeMs = performance.now();
  }

  /**
   * {@inheritdoc IMetricsCollector.recordAsync}
   */
  public async recordAsync(
    command: string,
    performanceData?: Partial<IPerformanceData>,
    parameters?: Record<string, string>
  ): Promise<void> {
    if (this._startTimeMs === undefined) {
      throw new InternalError('MetricsCollector has not been initialized with setStartTime() yet');
    }

    if (!command) {
      throw new InternalError('The command name must be specified.');
    }

    const filledPerformanceData: IPerformanceData = {
      taskTotalExecutionMs: (performance.now() - this._startTimeMs) / 1000,
      ...(performanceData || {})
    };

    const metricData: IMetricsData = {
      command: command,
      encounteredError: filledPerformanceData.encounteredError,
      taskTotalExecutionMs: filledPerformanceData.taskTotalExecutionMs,
      machineOs: process.platform,
      machineArch: process.arch,
      machineCores: os.cpus().length,
      machineProcessor: os.cpus()[0].model,
      machineTotalMemoryMB: os.totalmem(),
      commandParameters: parameters || {}
    };

    await this.recordMetricsHook.promise({
      metricName: 'inner_loop_heft',
      metricData
    });
  }
}
