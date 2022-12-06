// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { JsonFile, JsonSchema, FileSystem } from '@rushstack/node-core-library';

import schemaJson from '../../schemas/artifactory.schema.json';

export interface IArtifactoryPackageRegistryJson {
  enabled: boolean;
  userNpmrcLinesToAdd?: string[];

  registryUrl: string;
  artifactoryWebsiteUrl: string;

  credentialType?: 'password' | 'authToken';

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
  private static _jsonSchema: JsonSchema = JsonSchema.fromLoadedObject(schemaJson);

  private readonly _jsonFileName: string;

  /**
   * Get the artifactory configuration.
   */
  public readonly configuration: Readonly<IArtifactoryJson>;

  /**
   * @internal
   */
  public constructor(jsonFileName: string) {
    this._jsonFileName = jsonFileName;

    this.configuration = {
      packageRegistry: {
        enabled: false,
        registryUrl: '',
        artifactoryWebsiteUrl: ''
      }
    };

    if (FileSystem.exists(this._jsonFileName)) {
      this.configuration = JsonFile.loadAndValidate(this._jsonFileName, ArtifactoryConfiguration._jsonSchema);
      if (!this.configuration.packageRegistry.credentialType) {
        this.configuration.packageRegistry.credentialType = 'password';
      }
    }
  }
}
