// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, JsonFile, JsonSchema, IPackageJson } from '@rushstack/node-core-library';

import { RushConfiguration } from '../api/RushConfiguration';
import { RushConfigurationProject } from '../api/RushConfigurationProject';

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
    await JsonFile.saveAsync(this._data, filePath);
  }

  public static fromUpdatedProjects(
    rushConfiguration: RushConfiguration,
    updatedProjects: Map<string, IPackageJson>
  ): VersionManifest {
    const data: IVersionManifestJson = { projects: [] };

    for (const [name, packageJson] of updatedProjects) {
      const rushProject: RushConfigurationProject | undefined = rushConfiguration.getProjectByName(name);
      if (!rushProject) {
        throw new Error(`Unexpected project ${name} does not exist in rush.json`);
      }

      // The rush configuration contains an out-dated, in memory version of the Package Json files
      // for each project, which we take advantage of here for easy access to the previous version.
      const previousVersion: string = rushProject.packageJson.version;
      if (packageJson.version !== previousVersion) {
        // If the version did not change, it's likely a NONE bump type or a project
        // with impacted dependencies, neither of which will be included in the manifest.
        data.projects.push({
          name: name,
          relativeFolderPath: rushProject.projectRelativeFolder,
          version: packageJson.version,
          previousVersion: rushProject.packageJson.version
        });
      }
    }

    return new VersionManifest(data);
  }

  public static async load(filePath: string): Promise<VersionManifest> {
    const data: IVersionManifestJson = JsonFile.loadAndValidate(filePath, VersionManifest._jsonSchema);
    return new VersionManifest(data);
  }
}
