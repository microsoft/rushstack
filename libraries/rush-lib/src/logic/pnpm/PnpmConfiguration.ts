// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { JsonFile, JsonSchema, FileSystem } from '@rushstack/node-core-library';

interface IPnpmConfigurationJson {
  /**
   * Pnpm field in root package.json. See https://pnpm.io/package_json
   * The type of value is unknown because these fields are not validated by Rush.js
   */
  pnpmFieldInRootPackageJson?: unknown;
}

/**
 * Use this class to load "common/config/rush/pnpm-config.json" file.
 * The fields in the configuration will be patched into package.json under common temp folder.
 * @beta
 */
export class PnpmConfiguration {
  private static _jsonSchema: JsonSchema = JsonSchema.fromFile(
    path.resolve(__dirname, '../../schemas/pnpm-config.schema.json')
  );

  private _jsonFilename: string;

  public readonly pnpmFieldInRootPackageJson: unknown | undefined;

  private constructor(pnpmConfigurationJson: IPnpmConfigurationJson | undefined, jsonFilename: string) {
    this._jsonFilename = jsonFilename;

    this.pnpmFieldInRootPackageJson = pnpmConfigurationJson?.pnpmFieldInRootPackageJson;
  }

  /**
   * Loads pnpm-config.json data from the specified file path.
   */
  public static loadFromFile(jsonFilename: string): PnpmConfiguration {
    let pnpmConfigurationJson: IPnpmConfigurationJson | undefined;
    try {
      pnpmConfigurationJson = JsonFile.loadAndValidate(jsonFilename, PnpmConfiguration._jsonSchema);
    } catch (e) {
      if (FileSystem.isNotExistError(e as Error)) {
        pnpmConfigurationJson = undefined;
      } else {
        throw e;
      }
    }
    return new PnpmConfiguration(pnpmConfigurationJson, jsonFilename);
  }

  /**
   * Get the absolute file path of the common-versions.json file.
   */
  public get filePath(): string {
    return this._jsonFilename;
  }
}
