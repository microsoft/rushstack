// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { FileSystem, FileSystemStats, Import } from '@rushstack/node-core-library';

import { RushConfiguration } from '../api/RushConfiguration';
import { Rush } from '../api/Rush';
import { RushSession } from '../pluginFramework/RushSession';

const lodash: typeof import('lodash') = Import.lazy('lodash', require);

/**
 * @beta
 */
export enum TelemetryResult {
  Succeeded = 'Succeeded',
  Failed = 'Failed'
}

/**
 * @beta
 */
export interface ITelemetryData {
  /**
   * Command name
   * @example 'build'
   */
  name: string;
  /**
   * Duration in seconds
   */
  duration: number;
  /**
   * The result of the command
   */
  result: TelemetryResult;
  /**
   * The timestamp of the telemetry logging
   * @example 1648001893024
   */
  timestamp?: number;
  /**
   * The platform the command was executed on, reads from process.platform
   * @example darwin, win32, linux...
   */
  platform?: string;
  /**
   * The rush version
   * @example 5.63.0
   */
  rushVersion?: string;
  extraData?: { [key: string]: string };
}

const MAX_FILE_COUNT: number = 100;

export class Telemetry {
  private _enabled: boolean;
  private _store: ITelemetryData[];
  private _dataFolder: string;
  private _rushConfiguration: RushConfiguration;
  private _rushSession: RushSession;
  private _asyncTasks: Map<number, Promise<void>> = new Map();
  private _asyncTaskId: number = 1;

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
    const data: ITelemetryData = lodash.cloneDeep(telemetryData);
    data.timestamp = data.timestamp || new Date().getTime();
    data.platform = data.platform || process.platform;
    data.rushVersion = data.rushVersion || Rush.version;
    this._store.push(data);
  }

  public flush(writeFile: (file: string, data: string) => void = FileSystem.writeFile): void {
    if (!this._enabled || this._store.length === 0) {
      return;
    }

    const fullPath: string = this._getFilePath();
    FileSystem.ensureFolder(this._dataFolder);
    writeFile(fullPath, JSON.stringify(this._store));
    if (this._rushSession.hooks.flushTelemetry.isUsed()) {
      /**
       * User defined flushTelemetry should not block anything, so we don't await here,
       * and store the promise into a list so that we can await it later.
       */
      const asyncTaskId: number = this._asyncTaskId++;
      this._asyncTasks.set(
        asyncTaskId,
        this._rushSession.hooks.flushTelemetry.promise(this._store.slice()).then(
          () => {
            this._asyncTasks.delete(asyncTaskId);
          },
          () => {
            this._asyncTasks.delete(asyncTaskId);
          }
        )
      );
    }

    this._store = [];
    this._cleanUp();
  }

  /**
   * There are some async tasks that are not finished when the process is exiting.
   */
  public async ensureFlushedAsync(): Promise<void> {
    await Promise.all(this._asyncTasks.values());
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
