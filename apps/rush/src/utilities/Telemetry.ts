// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as fsx from 'fs-extra';
import { cloneDeep } from 'lodash';

import {
  RushConfiguration,
  rushVersion
} from '@microsoft/rush-lib';

export interface ITelemetryData {
  name: string;
  duration: number;
  result: string;
  timestamp?: number;
  platform?: string;
  rushVersion?: string;
  extraData?: { [key: string]: string };
}

export default class Telemetry {
  private readonly folderName: string = 'telemetry';
  private _enabled: boolean;
  private _store: ITelemetryData[];
  private _dataFolder: string;

  public constructor(private _rushConfiguration: RushConfiguration) {
    this._enabled = this._rushConfiguration.telemetryEnabled;
    this._store = [];
    this._dataFolder = path.join(this._rushConfiguration.commonTempFolder, this.folderName);
  }

  public log(telemetryData: ITelemetryData): void {
    if (!this._enabled) {
      return;
    }
    const data: ITelemetryData = cloneDeep(telemetryData);
    data.timestamp = data.timestamp ? data.timestamp : new Date().getTime();
    data.platform = data.platform ? data.platform : process.platform;
    data.rushVersion = data.rushVersion ? data.rushVersion : rushVersion;
    this._store.push(data);
  }

  public flush(writeFile: (file: string, data: string) => void = fsx.writeFileSync): void {
    if (!this._enabled) {
      return;
    }
    const fullPath: string = this._getFilePath();
    fsx.ensureDirSync(this._dataFolder);
    writeFile(fullPath, JSON.stringify(this._store));
    this._store = [];
  }

  public get store(): ITelemetryData[] {
    return this._store;
  }

  private _getFilePath(): string {
    let fileName: string = `telemetry_${new Date().toISOString()}`;
    fileName = fileName.replace(/[\-\:\.]/g, '_') + '.json';
    return path.join(this._dataFolder, fileName);
  }
}