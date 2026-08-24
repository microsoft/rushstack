// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, JsonFile, JsonSchema } from '@rushstack/node-core-library';

import schemaJson from '../schemas/rush-plugins.schema.json';

/**
 * @internal
 */
export interface IRushPluginConfigurationBase {
  packageName: string;
  pluginName: string;
}

export interface IRushPluginConfiguration extends IRushPluginConfigurationBase {
  autoinstallerName: string;
}

interface IRushPluginsConfigurationJson {
  plugins: IRushPluginConfiguration[];
}

const _jsonSchema: JsonSchema = JsonSchema.fromLoadedObject(schemaJson);

export class RushPluginsConfiguration {
  private _jsonFilename: string;

  public readonly configuration: Readonly<IRushPluginsConfigurationJson>;

  public constructor(jsonFilename: string) {
    this._jsonFilename = jsonFilename;
    this.configuration = {
      plugins: []
    };

    if (FileSystem.exists(this._jsonFilename)) {
      this.configuration = JsonFile.loadAndValidate(this._jsonFilename, _jsonSchema);
    }
  }
}
