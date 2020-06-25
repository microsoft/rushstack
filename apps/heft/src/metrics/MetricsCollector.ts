// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import { AsyncParallelHook, SyncHook } from 'tapable';
import { performance } from 'perf_hooks';

/**
 * @public
 */
export interface IMetricsData {
  /**
   * The command that was executed.
   */
  command: string;

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
}

/**
 * Tap these hooks to record events, to a file, for example.
 *
 * @public
 */
export class MetricsCollectorHooks {
  /**
   * This hook is called when an event is recorded.
   */
  public recordEvent: SyncHook<string, IMetricsData> = new SyncHook<string, IMetricsData>([
    'eventName',
    'metricsData'
  ]);

  /**
   * This hook is called when events should be flushed
   */
  public flush: AsyncParallelHook = new AsyncParallelHook();

  /**
   * This hook is called when events should be flushed and no more events will be logged.
   */
  public flushAndTeardown: AsyncParallelHook = new AsyncParallelHook();
}

/**
 * @internal
 */
export interface IPerformanceData {
  taskTotalExecutionMs: number;
}

/**
 * @internal
 * A simple performance metrics collector. A plugin is required to pipe events anywhere.
 */
export class MetricsCollector {
  public readonly hooks: MetricsCollectorHooks = new MetricsCollectorHooks();
  private _hasBeenTornDown: boolean = false;
  private _startTimeMs: number;

  /**
   * Start event log timer.
   */
  public setStartTime(): void {
    this._startTimeMs = performance.now();
  }

  /**
   * Set the event log end time and log the event in aria.
   * @param command - Describe the user command, e.g. `start` or `build`
   * @param params - Optional parameters
   */
  public record(command: string, performanceData?: Partial<IPerformanceData>): void {
    if (this._hasBeenTornDown) {
      throw new Error('MetricsCollector has been torn down.');
    }

    if (!command) {
      throw new Error('The command name must be specified.');
    }

    const filledPerformanceData: IPerformanceData = {
      taskTotalExecutionMs: (performance.now() - this._startTimeMs) / 1000,
      ...(performanceData || {})
    };

    const eventData: IMetricsData = {
      command: command,
      taskTotalExecutionMs: filledPerformanceData.taskTotalExecutionMs,
      machineOs: process.platform,
      machineArch: process.arch,
      machineCores: os.cpus().length,
      machineProcessor: os.cpus()[0].model,
      machineTotalMemoryMB: os.totalmem()
    };

    this.hooks.recordEvent.call('inner_loop_heft', eventData);
  }

  /**
   * Flushes all pending logged events.
   */
  public async flushAsync(): Promise<void> {
    if (this._hasBeenTornDown) {
      throw new Error('MetricsCollector has been torn down.');
    }

    await this.hooks.flush.promise();
  }

  /**
   * Flushes all pending logged events and closes the MetricsCollector instance.
   */
  public async flushAndTeardownAsync(): Promise<void> {
    if (this._hasBeenTornDown) {
      throw new Error('MetricsCollector has already been torn down.');
    }

    await this.hooks.flushAndTeardown.promise();
    this._hasBeenTornDown = true;
  }
}
