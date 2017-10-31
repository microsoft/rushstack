// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as fsx from 'fs-extra';
import { cloneDeep } from 'lodash';

import RushConfiguration from '../../data/RushConfiguration';
import Rush from '../../Rush';

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

export default class Telemetry {
  private _enabled: boolean;
  private _store: ITelemetryData[];
  private _dataFolder: string;

  public constructor(private _rushConfiguration: RushConfiguration) {
    this._enabled = this._rushConfiguration.telemetryEnabled;
    this._store = [];

    const folderName: string = 'telemetry';
    this._dataFolder = path.join(this._rushConfiguration.commonTempFolder, folderName);
  }

  public log(telemetryData: ITelemetryData): void {
    if (!this._enabled) {
      return;
    }
    const data: ITelemetryData = cloneDeep(telemetryData);
    data.timestamp = data.timestamp || new Date().getTime();
    data.platform = data.platform || process.platform;
    data.rushVersion = data.rushVersion || Rush.version;
    this._store.push(data);
  }

  public flush(writeFile: (file: string, data: string) => void = fsx.writeFileSync): void {
    if (!this._enabled || this._store.length === 0) {
      return;
    }

    const fullPath: string = this._getFilePath();
    fsx.ensureDirSync(this._dataFolder);
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
    if (fsx.existsSync(this._dataFolder)) {
      const files: string[] = fsx.readdirSync(this._dataFolder);
      if (files.length > MAX_FILE_COUNT) {
        const sortedFiles: string[] = files.map(fileName => {
          const filePath: string = path.join(this._dataFolder, fileName);
          const stats: fsx.Stats = fsx.statSync(filePath);
          return {
            filePath: filePath,
            modifiedTime: stats.mtime.getTime(),
            isFile: stats.isFile()
          };
        })
        .filter(value => {
          // Only delete files
          return value.isFile;
        })
        .sort((a, b) => {
          return a.modifiedTime - b.modifiedTime;
        })
        .map(s => {
          return s.filePath;
        });
        const filesToDelete: number = sortedFiles.length - MAX_FILE_COUNT;
        for (let i: number = 0; i < filesToDelete; i++) {
          fsx.unlinkSync(sortedFiles[i]);
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