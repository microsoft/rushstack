// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { JsonFile, JsonSchema, FileSystem } from '@rushstack/node-core-library';

export interface IArtifactoryPackageRegistryJson {
  enabled: boolean;
  userNpmrcLinesToAdd?: string[];

  registryUrl: string;
  artifactoryWebsiteUrl: string;

  messageOverrides?: {
    introduction?: string;
    obtainAnAccount?: string;
    visitWebsite?: string;
    locateUserName?: string;
    locateApiKey?: string;
  };
}

/**
 * This interface represents the raw artifactory.json file.
 * @beta
 */
export interface IArtifactoryJson {
  packageRegistry: IArtifactoryPackageRegistryJson;
}

/**
 * Use this class to load the "common/config/rush/artifactory.json" config file.
 * It configures the "rush setup" command.
 */
export class ArtifactoryConfiguration {
  private static _jsonSchema: JsonSchema = JsonSchema.fromFile(
    path.resolve(__dirname, '..', '..', 'schemas', 'artifactory.schema.json')
  );

  private _setupJson: IArtifactoryJson;
  private _jsonFileName: string;

  /**
   * @internal
   */
  public constructor(jsonFileName: string) {
    this._jsonFileName = jsonFileName;

    this._setupJson = {
      packageRegistry: {
        enabled: false,
        registryUrl: '',
        artifactoryWebsiteUrl: ''
      }
    };

    if (FileSystem.exists(this._jsonFileName)) {
      this._setupJson = JsonFile.loadAndValidate(this._jsonFileName, ArtifactoryConfiguration._jsonSchema);
    }
  }

  /**
   * Get the experiments configuration.
   */
  public get configuration(): Readonly<IArtifactoryJson> {
    return this._setupJson;
  }
}
