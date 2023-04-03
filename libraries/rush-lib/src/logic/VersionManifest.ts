// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, JsonFile, JsonSchema, IPackageJson } from '@rushstack/node-core-library';

import schemaJson from '../schemas/version-manifest.schema.json';

interface IVersionManifestJson {
  projects: IVersionManifestProjectJson[];
}

interface IVersionManifestProjectJson {
  name: string;
  relativeFolderPath: string;
  version: string;
  previousVersion?: string;
}

/**
 * A "version manifest" is a small JSON file that describes the results of a versioning
 * event (for example, running "rush version --bump").
 */
export class VersionManifest {
  private static _jsonSchema: JsonSchema = JsonSchema.fromLoadedObject(schemaJson);

  private readonly _data: IVersionManifestJson;

  private constructor(data: IVersionManifestJson) {
    this._data = data;
  }

  public async save(filePath: string): Promise<void> {
    await FileSystem.writeFileAsync(filePath, JSON.stringify(this._data, undefined, 2));
  }

  public static fromUpdatedProjects(updatedProjects: Map<string, IPackageJson>): VersionManifest {
    const data: IVersionManifestJson = { projects: [] };

    for (const [name, packageJson] of updatedProjects.entries()) {
      data.projects.push({
        name: name,
        relativeFolderPath: '.',
        version: packageJson.version
      });
    }

    return new VersionManifest(data);
  }

  public static async load(filePath: string): Promise<VersionManifest> {
    const data: IVersionManifestJson = JsonFile.loadAndValidate(filePath, VersionManifest._jsonSchema);
    return new VersionManifest(data);
  }
}
