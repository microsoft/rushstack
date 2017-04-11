// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as semver from 'semver';

import JsonFile from '../utilities/JsonFile';

export interface IPinnedVersionsJson {
  [dependency: string]: string;
}

export class PinnedVersionsConfiguration extends Map<string, string> {
  private _filename: string;

  public static tryLoadFromFile(jsonFilename: string): PinnedVersionsConfiguration {
    let pinnedVersionJson: IPinnedVersionsJson = undefined;
    try {
      pinnedVersionJson = JsonFile.loadJsonFile(jsonFilename);
    } catch (e) {
      /* no-op */
    }

    return PinnedVersionsConfiguration.create(pinnedVersionJson, jsonFilename);
  }

  public static create(pinnedVersionJson: IPinnedVersionsJson, filename: string): PinnedVersionsConfiguration {
    // This is a workaround for extending a Map in es5, although technically
    // __proto__ was standardized in es6, this should work anyhow since people only
    // run this tool via node anyway, which is es6

    const inst: Map<string, string> = new Map<string, string>();
    // tslint:disable-next-line:no-string-literal
    inst['__proto__'] = PinnedVersionsConfiguration.prototype;
    const newInst: PinnedVersionsConfiguration = inst as PinnedVersionsConfiguration;

    newInst._filename = filename;

    return newInst;
  }

  /**
   * DO NOT CALL -- Use PinnedVersionsConfiguration.loadFromFile() instead.
   */
  constructor() {
    super();
    throw new Error(`Do not directly instantiate PinnedVersionsConfiguration`);
  }

  public set(dependency: string, version: string): this {
    if (!semver.valid(version)) {
      throw new Error(`In rush.json, the pinned version "${version}" for "${dependency}"` +
        ` project is not a valid semantic version`);
    }
    super.set(dependency, version);
    return this;
  }

  public save(): this {
    JsonFile.saveJsonFile(this._serialize(), this._filename);
    return this;
  }

  private _serialize(): IPinnedVersionsJson {
    const rawJson: IPinnedVersionsJson = {};
    this.forEach((version: string, dependency: string) => {
      rawJson[dependency] = version;
    });
    return rawJson;
  }
}
