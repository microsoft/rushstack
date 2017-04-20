// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'fs';
import * as semver from 'semver';

import JsonFile from '../utilities/JsonFile';

interface IPinnedVersionsJson {
  [dependency: string]: string;
}

/**
 * Pinned Versions is a rush feature designed to mimic the behavior of NPM
 * when performing an install. Essentially, for a project, NPM installs all of
 * the first level dependencies before starting any second-level dependencies.
 * This means that you can control the specific version of a second-level dependency
 * by promoting it to a 1st level dependency and using a version number that would satisfy.
 * However, since rush uses the /common/package.json file, NPM treats each rush project
 * as a top-level dependency, and treats the actual 1st level dependencies as second order.
 * This means you could have cases where there is unnecessary inversion and side-by-side versioning
 * in your shrinkwrap file. To mitigate this issue, we promote some dependencies and list them
 * directly in the /common/package.json, ensuring that the selected version will be installed first
 * and at the root.
 * @public
 */
export class PinnedVersionsConfiguration {
  private _data: Map<string, string>;

  /** Attempts to load pinned versions configuration from a given file */
  public static tryLoadFromFile(jsonFilename: string): PinnedVersionsConfiguration {
    let pinnedVersionJson: IPinnedVersionsJson = undefined;
    if (fs.existsSync(jsonFilename)) {
      pinnedVersionJson = JsonFile.loadJsonFile(jsonFilename);
    }

    return new PinnedVersionsConfiguration(pinnedVersionJson, jsonFilename);
  }

  /** Set a pinned version. Checks that the version is a valid semver. */
  public set(dependency: string, version: string): this {
    if (!semver.valid(version) && !semver.validRange(version)) {
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

  /**
   * Preferred to use PinnedVersionsConfiguration.loadFromFile()
   */
  private constructor(pinnedVersionJson: IPinnedVersionsJson, private _filename: string) {
    this._data = new Map<string, string>();
    Object.keys(pinnedVersionJson || {}).forEach((dep: string) => {
      this.set(dep, pinnedVersionJson[dep]);
    });
  }
}
