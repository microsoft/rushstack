// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// eslint-disable-next-line @typescript-eslint/typedef
const importLazy = require('import-lazy')(require);

import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/typedef
const _ = importLazy('lodash');
import { FileSystem } from '@rushstack/node-core-library';

import { RushConfiguration } from '../api/RushConfiguration';
import { Rush } from '../api/Rush';

export interface ITelemetryData {
  name: string;
  duration: number;
  result: string;
  timestamp?: number;
  platform?: string;
  rushVersion?: string;
  extraData?: { [key: string]: string };
}

const MAX_FILE_COUNT: number = 100;

export class Telemetry {
  private _enabled: boolean;
  private _store: ITelemetryData[];
  private _dataFolder: string;
  private _rushConfiguration: RushConfiguration;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
    this._enabled = this._rushConfiguration.telemetryEnabled;
    this._store = [];

    const folderName: string = 'telemetry';
    this._dataFolder = path.join(this._rushConfiguration.commonTempFolder, folderName);
  }

  public log(telemetryData: ITelemetryData): void {
    if (!this._enabled) {
      return;
    }
    const data: ITelemetryData = _.cloneDeep(telemetryData);
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
    this._store = [];
    this._cleanUp();
  }

  public get store(): ITelemetryData[] {
    return this._store;
  }

  /**
   * When there are too many log files, delete the old ones.
   */
  private _cleanUp(): void {
    if (FileSystem.exists(this._dataFolder)) {
      const files: string[] = FileSystem.readFolder(this._dataFolder);
      if (files.length > MAX_FILE_COUNT) {
        const sortedFiles: string[] = files
          .map((fileName) => {
            const filePath: string = path.join(this._dataFolder, fileName);
            const stats: fs.Stats = FileSystem.getStatistics(filePath);
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
