// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'node:os';
import * as path from 'node:path';
import type { PerformanceEntry } from 'node:perf_hooks';
import { FileSystem, type FileSystemStats, JsonFile } from '@rushstack/node-core-library';

import type { RushConfiguration } from '../api/RushConfiguration';
import { Rush } from '../api/Rush';
import type { RushSession } from '../pluginFramework/RushSession';
import { collectPerformanceEntries } from '../utilities/performance';

/**
 * @beta
 */
export interface ITelemetryMachineInfo {
  /**
   * The CPU architecture
   * @example `"AMD64"`
   */
  machineArchitecture: string;

  /**
   * The CPU model
   * * @example `"AMD Ryzen 7 3700X 8-Core Processor"`
   */
  machineCpu: string;

  /**
   * The number of logical CPU cores.
   */
  machineCores: number;

  /**
   * The total amount of RAM on the machine, in MiB.
   */
  machineTotalMemoryMiB: number;

  /**
   * The amount of free RAM on the machine at the end of execution, in MiB.
   */
  machineFreeMemoryMiB: number;
}

/**
 * @beta
 */
export interface ITelemetryOperationResult {
  /**
   * The names of operations that this operation depends on.
   */
  dependencies: string[];

  /**
   * The status code for the operation.
   */
  result: string;

  /**
   * A timestamp in milliseconds (from `performance.now()`) when the operation started.
   * If the operation was blocked, will be `undefined`.
   */
  startTimestampMs?: number;

  /**
   * A timestamp in milliseconds (from `performance.now()`) when the operation finished.
   * If the operation was blocked, will be `undefined`.
   */
  endTimestampMs?: number;

  /**
   * Duration in milliseconds when the operation does not hit cache
   */
  nonCachedDurationMs?: number;

  /**
   * Was this operation built on this machine? If so, the duration can be calculated from `startTimestampMs` and `endTimestampMs`.
   *  If not, you should use the metrics from the machine that built it.
   */
  wasExecutedOnThisMachine?: boolean;
}

/**
 * @beta
 */
export interface ITelemetryData {
  /**
   * Command name
   * @example `"build"`
   */
  readonly name: string;

  /**
   * Duration in seconds
   */
  readonly durationInSeconds: number;

  /**
   * The result of the command
   */
  readonly result: 'Succeeded' | 'Failed';

  /**
   * The millisecond-resolution timestamp of the telemetry logging
   * @example 1648001893024
   */
  readonly timestampMs?: number;

  /**
   * The platform the command was executed on, based on the Node.js `process.platform()` API
   * @example `"darwin"`, `"win32"`, `"linux"`
   */
  readonly platform?: string;

  /**
   * The Rush version
   * @example `5.63.0`
   */
  readonly rushVersion?: string;

  /**
   * Detailed information about the host machine.
   */
  readonly machineInfo?: ITelemetryMachineInfo;

  /**
   * Only applicable to phased commands. Provides detailed results by operation.
   * Keys are operation names, values contain result, timing information, and dependencies.
   */
  readonly operationResults?: Record<string, ITelemetryOperationResult>;

  readonly extraData?: { [key: string]: string | number | boolean };

  /**
   * Performance marks and measures collected during the execution of this command.
   * This is an array of `PerformanceEntry` objects, which can include marks, measures, and function timings.
   */
  readonly performanceEntries?: readonly PerformanceEntry[];
}

const MAX_FILE_COUNT: number = 100;
const ONE_MEGABYTE_IN_BYTES: 1048576 = 1048576;

export class Telemetry {
  private _enabled: boolean;
  private _store: ITelemetryData[];
  private _dataFolder: string;
  private _rushConfiguration: RushConfiguration;
  private _rushSession: RushSession;
  private _flushAsyncTasks: Set<Promise<void>> = new Set();
  private _telemetryStartTime: number = 0;

  public constructor(rushConfiguration: RushConfiguration, rushSession: RushSession) {
    this._rushConfiguration = rushConfiguration;
    this._rushSession = rushSession;
    this._enabled = this._rushConfiguration.telemetryEnabled;
    this._store = [];

    const folderName: string = 'telemetry';
    this._dataFolder = path.join(this._rushConfiguration.commonTempFolder, folderName);
  }

  public log(telemetryData: ITelemetryData): void {
    if (!this._enabled) {
      return;
    }
    const cpus: os.CpuInfo[] = os.cpus();
    const data: ITelemetryData = {
      ...telemetryData,
      performanceEntries:
        telemetryData.performanceEntries || collectPerformanceEntries(this._telemetryStartTime),
      machineInfo: telemetryData.machineInfo || {
        machineArchitecture: os.arch(),
        // The Node.js model is sometimes padded, for example:
        // "AMD Ryzen 7 3700X 8-Core Processor             "
        machineCpu: cpus[0].model.trim(),
        machineCores: cpus.length,
        machineTotalMemoryMiB: Math.round(os.totalmem() / ONE_MEGABYTE_IN_BYTES),
        machineFreeMemoryMiB: Math.round(os.freemem() / ONE_MEGABYTE_IN_BYTES)
      },
      timestampMs: telemetryData.timestampMs || new Date().getTime(),
      platform: telemetryData.platform || process.platform,
      rushVersion: telemetryData.rushVersion || Rush.version
    };
    this._telemetryStartTime = performance.now();
    this._store.push(data);
  }

  public flush(): void {
    if (!this._enabled || this._store.length === 0) {
      return;
    }

    const fullPath: string = this._getFilePath();
    JsonFile.save(this._store, fullPath, { ensureFolderExists: true, ignoreUndefinedValues: true });
    if (this._rushSession.hooks.flushTelemetry.isUsed()) {
      /**
       * User defined flushTelemetry should not block anything, so we don't await here,
       * and store the promise into a list so that we can await it later.
       */
      const asyncTaskPromise: Promise<void> = this._rushSession.hooks.flushTelemetry.promise(this._store);
      this._flushAsyncTasks.add(asyncTaskPromise);
      asyncTaskPromise.then(
        () => {
          this._flushAsyncTasks.delete(asyncTaskPromise);
        },
        () => {
          this._flushAsyncTasks.delete(asyncTaskPromise);
        }
      );
    }

    this._store = [];
    this._cleanUp();
  }

  /**
   * There are some async tasks that are not finished when the process is exiting.
   */
  public async ensureFlushedAsync(): Promise<void> {
    await Promise.all(this._flushAsyncTasks);
  }

  public get store(): ITelemetryData[] {
    return this._store;
  }

  /**
   * When there are too many log files, delete the old ones.
   */
  private _cleanUp(): void {
    if (FileSystem.exists(this._dataFolder)) {
      const files: string[] = FileSystem.readFolderItemNames(this._dataFolder);
      if (files.length > MAX_FILE_COUNT) {
        const sortedFiles: string[] = files
          .map((fileName) => {
            const filePath: string = path.join(this._dataFolder, fileName);
            const stats: FileSystemStats = FileSystem.getStatistics(filePath);
            return {
              filePath: filePath,
              modifiedTime: stats.mtime.getTime(),
              isFile: stats.isFile()
            };
          })
          .filter((value) => {
            // Only delete files
            return value.isFile;
          })
          .sort((a, b) => {
            return a.modifiedTime - b.modifiedTime;
          })
          .map((s) => {
            return s.filePath;
          });
        const filesToDelete: number = sortedFiles.length - MAX_FILE_COUNT;
        for (let i: number = 0; i < filesToDelete; i++) {
          FileSystem.deleteFile(sortedFiles[i]);
        }
      }
    }
  }

  private _getFilePath(): string {
    let fileName: string = `telemetry_${new Date().toISOString()}`;
    fileName = fileName.replace(/[\-\:\.]/g, '_') + '.json';
    return path.join(this._dataFolder, fileName);
  }
}
