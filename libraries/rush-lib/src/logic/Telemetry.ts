// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { FileSystem, FileSystemStats, JsonFile } from '@rushstack/node-core-library';

import { RushConfiguration } from '../api/RushConfiguration';
import { Rush } from '../api/Rush';
import { RushSession } from '../pluginFramework/RushSession';

/**
 * @beta
 */
export interface ITelemetryData {
  /**
   * Command name
   * @example 'build'
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
   * The timestamp of the telemetry logging
   * @example 1648001893024
   */
  readonly timestamp?: number;
  /**
   * The platform the command was executed on, reads from process.platform
   * @example darwin, win32, linux...
   */
  readonly platform?: string;
  /**
   * The rush version
   * @example 5.63.0
   */
  readonly rushVersion?: string;
  readonly extraData?: { [key: string]: string | number | boolean };
}

const MAX_FILE_COUNT: number = 100;

export class Telemetry {
  private _enabled: boolean;
  private _store: ITelemetryData[];
  private _dataFolder: string;
  private _rushConfiguration: RushConfiguration;
  private _rushSession: RushSession;
  private _flushAsyncTasks: Set<Promise<void>> = new Set();

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
    const data: ITelemetryData = {
      ...telemetryData,
      timestamp: telemetryData.timestamp || new Date().getTime(),
      platform: telemetryData.platform || process.platform,
      rushVersion: telemetryData.rushVersion || Rush.version
    };
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
