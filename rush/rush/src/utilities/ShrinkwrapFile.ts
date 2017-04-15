// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as os from 'os';
import * as semver from 'semver';

interface IShrinkwrapDependencyJson {
  version: string;
  from: string;
  resolved: string;
  dependencies: { [dependency: string]: IShrinkwrapDependencyJson };
}

interface IShrinkwrapJson {
  name: string;
  version: string;
  dependencies: { [dependency: string]: IShrinkwrapDependencyJson };
}

export default class ShrinkwrapFile {
  private _shrinkwrapJson: IShrinkwrapJson;

  public static loadFromFile(shrinkwrapJsonFilename: string): ShrinkwrapFile | undefined {
    let data: string = undefined;
    try {
      if (!fsx.existsSync(shrinkwrapJsonFilename)) {
        return undefined; // file does not exist
      }

      // We don't use JsonFile/jju here because shrinkwrap.json is a special NPM file format
      // and typically very large, so we want to load it the same way that NPM does.
      const buffer: Buffer = fsx.readFileSync(shrinkwrapJsonFilename);
      data = buffer.toString();
      if (data.charCodeAt(0) === 0xFEFF) {  // strip BOM
        data = data.slice(1);
      }

      return new ShrinkwrapFile(JSON.parse(data));
    } catch (error) {
      throw new Error(`Error reading "${shrinkwrapJsonFilename}":` + os.EOL + `  ${error.message}`);
    }
  }

  private static tryGetValue<T>(dictionary: { [key2: string]: T }, key: string): T | undefined {
    if (dictionary.hasOwnProperty(key)) {
      return dictionary[key];
    }
    return undefined;
  }

  public hasCompatibleDependency(dependencyName: string, version: string,
    tempProjectName?: string): boolean {

    // First, check under tempProjectName, as this is the first place "rush link" looks.
    let dependencyJson: IShrinkwrapDependencyJson = undefined;

    if (tempProjectName) {
      const tempDependency: IShrinkwrapDependencyJson = ShrinkwrapFile.tryGetValue(
        this._shrinkwrapJson.dependencies, tempProjectName);
      if (tempDependency && tempDependency.dependencies) {
        dependencyJson = ShrinkwrapFile.tryGetValue(tempDependency.dependencies, dependencyName);
      }
    }

    // Otherwise look at the root of the shrinkwrap file
    if (!dependencyJson && this._shrinkwrapJson.dependencies) {
      dependencyJson = ShrinkwrapFile.tryGetValue(this._shrinkwrapJson.dependencies, dependencyName);
    }

    if (!dependencyJson) {
      return undefined;
    }

    // If we found it, the version must be compatible
    return semver.satisfies(dependencyJson.version, version);
  }

  private constructor(shrinkwrapJson: IShrinkwrapJson) {
    this._shrinkwrapJson = shrinkwrapJson;

    // Normalize the data
    if (!this._shrinkwrapJson.version) {
      this._shrinkwrapJson.version = '';
    }
    if (!this._shrinkwrapJson.name) {
      this._shrinkwrapJson.name = '';
    }
    if (!this._shrinkwrapJson.dependencies) {
      this._shrinkwrapJson.dependencies = { };
    }
  }
}
