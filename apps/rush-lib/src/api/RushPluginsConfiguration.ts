// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { FileSystem, JsonFile, JsonSchema } from '@rushstack/node-core-library';

/**
 * @beta
 */
export interface IRushPluginConfiguration {
  packageName: string;
  pluginName: string;
  autoinstallerName: string;
  optionsJsonFilePath?: string;
}

/**
 * @beta
 */
interface IRushPluginsConfigurationJson {
  plugins: IRushPluginConfiguration[];
}

/**
 * @beta
 */
export class RushPluginsConfiguration {
  private static _jsonSchema: JsonSchema = JsonSchema.fromFile(
    path.join(__dirname, '..', 'schemas', 'rush-plugins.schema.json')
  );

  private _rushPluginsConfigurationJson: IRushPluginsConfigurationJson;
  private _jsonFilename: string;

  public constructor(jsonFilename: string) {
    this._jsonFilename = jsonFilename;
    this._rushPluginsConfigurationJson = {
      plugins: []
    };

    if (FileSystem.exists(this._jsonFilename)) {
      this._rushPluginsConfigurationJson = JsonFile.loadAndValidate(
        this._jsonFilename,
        RushPluginsConfiguration._jsonSchema
      );
    }
  }

  public get configuration(): Readonly<IRushPluginsConfigurationJson> {
    return this._rushPluginsConfigurationJson;
  }
}
