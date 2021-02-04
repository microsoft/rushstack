// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { JsonFile, JsonSchema, FileSystem } from '@rushstack/node-core-library';

export interface ISetupPackageRegistryJson {
  enabled: boolean;
  registryService: 'artifactory';
  registryUrl: string;
  artifactoryWebsiteUrl: string;

  globallyMappedNpmScopes?: string[];
  messageOverrides?: {
    [messageId: string]: string;
  };
}

/**
 * This interface represents the raw setup.json file.
 * @beta
 */
export interface ISetupJson {
  packageRegistry: ISetupPackageRegistryJson;
}

/**
 * Use this class to load the "common/config/rush/setup.json" config file.
 * It configures the "rush setup" command.
 */
export class SetupConfiguration {
  private static _jsonSchema: JsonSchema = JsonSchema.fromFile(
    path.resolve(__dirname, '..', '..', 'schemas', 'setup.schema.json')
  );

  private _setupJson: ISetupJson;
  private _jsonFileName: string;

  /**
   * @internal
   */
  public constructor(jsonFileName: string) {
    this._jsonFileName = jsonFileName;

    this._setupJson = {
      packageRegistry: {
        enabled: false,
        registryService: 'artifactory',
        registryUrl: '',
        artifactoryWebsiteUrl: ''
      }
    };

    if (FileSystem.exists(this._jsonFileName)) {
      this._setupJson = JsonFile.loadAndValidate(this._jsonFileName, SetupConfiguration._jsonSchema);
    }
  }

  /**
   * Get the experiments configuration.
   */
  public get configuration(): Readonly<ISetupJson> {
    return this._setupJson;
  }
}
