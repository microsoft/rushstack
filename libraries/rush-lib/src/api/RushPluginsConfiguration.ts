// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, JsonFile, JsonSchema } from '@rushstack/node-core-library';

import schemaJson from '../schemas/rush-plugins.schema.json';
import type { RushPluginsConfiguration as IRushPluginsConfigurationJson } from '../schemas/rush-plugins.schema.json.d.ts';

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

export class RushPluginsConfiguration {
  private static _jsonSchema: JsonSchema = JsonSchema.fromLoadedObject(schemaJson);

  private _jsonFilename: string;

  public readonly configuration: Readonly<IRushPluginsConfigurationJson>;

  public constructor(jsonFilename: string) {
    this._jsonFilename = jsonFilename;
    this.configuration = {
      plugins: []
    };

    if (FileSystem.exists(this._jsonFilename)) {
      this.configuration = JsonFile.loadAndValidate(this._jsonFilename, RushPluginsConfiguration._jsonSchema);
    }
  }
}
