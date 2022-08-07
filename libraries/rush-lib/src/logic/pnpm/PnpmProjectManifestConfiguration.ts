// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { JsonFile, JsonSchema, FileSystem } from '@rushstack/node-core-library';

/**
 * Pnpm config in package.json
 * @beta
 */
export interface IPnpmProjectManifestConfigurationJson {
  /**
   * Pnpm field in root package.json. See https://pnpm.io/package_json
   * The type of value is unknown because these fields are not validated by Rush.js
   */
  pnpmFieldInRootPackageJson: unknown;
}

/**
 * Use this class to load "common/config/rush/pnpm-config.json" file.
 * The fields in the configuration will be patched into package.json under common temp folder.
 * @beta
 */
export class PnpmProjectManifestConfiguration {
  private static _jsonSchema: JsonSchema = JsonSchema.fromFile(
    path.resolve(__dirname, '../../schemas/pnpm-config.schema.json')
  );

  private _jsonFilename: string;

  public readonly pnpmFieldInRootPackageJson: unknown | undefined;

  private constructor(
    pnpmProjectManifestConfigurationJson: IPnpmProjectManifestConfigurationJson | undefined,
    jsonFilename: string
  ) {
    this._jsonFilename = jsonFilename;

    if (pnpmProjectManifestConfigurationJson) {
      if ('pnpmFieldInRootPackageJson' in pnpmProjectManifestConfigurationJson) {
        this.pnpmFieldInRootPackageJson = pnpmProjectManifestConfigurationJson.pnpmFieldInRootPackageJson;
      }
    }
  }

  /**
   * Loads pnpm-config.json data from the specified file path.
   */
  public static loadFromFile(jsonFilename: string): PnpmProjectManifestConfiguration {
    let pnpmProjectManifestConfigurationJson: IPnpmProjectManifestConfigurationJson | undefined;
    if (FileSystem.exists(jsonFilename)) {
      pnpmProjectManifestConfigurationJson = JsonFile.loadAndValidate(
        jsonFilename,
        PnpmProjectManifestConfiguration._jsonSchema
      );
    }
    return new PnpmProjectManifestConfiguration(pnpmProjectManifestConfigurationJson, jsonFilename);
  }

  /**
   * Get the absolute file path of the common-versions.json file.
   */
  public get filePath(): string {
    return this._jsonFilename;
  }
}
