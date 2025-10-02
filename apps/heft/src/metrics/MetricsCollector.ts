// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'node:os';
import { performance } from 'node:perf_hooks';

import { AsyncParallelHook } from 'tapable';

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
   * The total execution duration of all user-defined tasks from `heft.json`, in milliseconds.
   * This metric is for measuring the cumulative time spent on the underlying build steps for a project.
   * If running in watch mode, this will be the duration of the most recent incremental build.
   */
  taskTotalExecutionMs: number;

  /**
   * The total duration before Heft started executing user-defined tasks, in milliseconds.
   * This metric is for tracking the contribution of Heft itself to total build duration.
   */
  bootDurationMs: number;

  /**
   * How long the process has been alive, in milliseconds.
   * This metric is for watch mode, to analyze how long developers leave individual Heft sessions running.
   */
  totalUptimeMs: number;

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
 * @internal
 * A simple performance metrics collector. A plugin is required to pipe data anywhere.
 */
export class MetricsCollector {
  public readonly recordMetricsHook: AsyncParallelHook<IHeftRecordMetricsHookOptions> =
    new AsyncParallelHook<IHeftRecordMetricsHookOptions>(['recordMetricsHookOptions']);

  private _bootDurationMs: number | undefined;
  private _startTimeMs: number | undefined;

  /**
   * Start metrics log timer.
   */
  public setStartTime(): void {
    if (this._bootDurationMs === undefined) {
      // Only set this once. This is for tracking boot overhead.
      this._bootDurationMs = process.uptime() * 1000;
    }
    this._startTimeMs = performance.now();
  }

  /**
   * Record metrics to the installed plugin(s).
   *
   * @param command - Describe the user command, e.g. `start` or `build`
   * @param parameterMap - Optional map of parameters to their values
   * @param performanceData - Optional performance data
   */
  public async recordAsync(
    command: string,
    performanceData?: Partial<IPerformanceData>,
    parameters?: Record<string, string>
  ): Promise<void> {
    const { _bootDurationMs, _startTimeMs } = this;
    if (_bootDurationMs === undefined || _startTimeMs === undefined) {
      throw new InternalError('MetricsCollector has not been initialized with setStartTime() yet');
    }

    if (!command) {
      throw new InternalError('The command name must be specified.');
    }

    const filledPerformanceData: IPerformanceData = {
      taskTotalExecutionMs: performance.now() - _startTimeMs,
      ...(performanceData || {})
    };

    const { taskTotalExecutionMs } = filledPerformanceData;

    const cpus: os.CpuInfo[] = os.cpus();

    const metricData: IMetricsData = {
      command: command,
      encounteredError: filledPerformanceData.encounteredError,
      bootDurationMs: _bootDurationMs,
      taskTotalExecutionMs: taskTotalExecutionMs,
      totalUptimeMs: process.uptime() * 1000,
      machineOs: process.platform,
      machineArch: process.arch,
      machineCores: cpus.length,
      // The Node.js model is sometimes padded, for example:
      // "AMD Ryzen 7 3700X 8-Core Processor
      machineProcessor: cpus[0].model.trim(),
      machineTotalMemoryMB: os.totalmem(),
      commandParameters: parameters || {}
    };

    await this.recordMetricsHook.promise({
      metricName: 'inner_loop_heft',
      metricData
    });
  }
}
