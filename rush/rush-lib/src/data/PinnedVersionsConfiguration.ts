// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'fs';
import * as semver from 'semver';

import JsonFile from '../utilities/JsonFile';

export interface IPinnedVersionsJson {
  [dependency: string]: string;
}

export class PinnedVersionsConfiguration {
  private _data: Map<string, string>;

  public static tryLoadFromFile(jsonFilename: string): PinnedVersionsConfiguration {
    let pinnedVersionJson: IPinnedVersionsJson = undefined;
    if (fs.existsSync(jsonFilename)) {
      pinnedVersionJson = JsonFile.loadJsonFile(jsonFilename);
    }

    return new PinnedVersionsConfiguration(pinnedVersionJson, jsonFilename);
  }

  /**
   * Preferred to use PinnedVersionsConfiguration.loadFromFile()
   */
  constructor(pinnedVersionJson: IPinnedVersionsJson, private _filename: string) {
    this._data = new Map<string, string>();
    Object.keys(pinnedVersionJson || {}).forEach((dep: string) => {
      this.set(dep, pinnedVersionJson[dep]);
    });
  }

  public set(dependency: string, version: string): this {
    if (!semver.valid(version)) {
      throw new Error(`The pinned version "${version}" for "${dependency}" project is not a valid semantic version.`);
    }
    this._data.set(dependency, version);
    return this;
  }

  public get(dependency: string): string {
    return this._data.get(dependency);
  }

  public has(dependency: string): boolean {
    return this._data.has(dependency);
  }

  public forEach(cb: (version: string, dependency: string) => void): this {
    this._data.forEach(cb);
    return this;
  }

  public save(): this {
    JsonFile.saveJsonFile(this._serialize(), this._filename);
    return this;
  }

  public delete(dependency: string): boolean {
    return this._data.delete(dependency);
  }

  public clear(): this {
    this._data.clear();
    return this;
  }

  public get size(): number {
    return this._data.size;
  }

  private _serialize(): IPinnedVersionsJson {
    const rawJson: IPinnedVersionsJson = {};
    this._data.forEach((version: string, dependency: string) => {
      rawJson[dependency] = version;
    });
    return rawJson;
  }
}
