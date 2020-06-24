// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { FileSystem, JsonFile, JsonSchema } from '@rushstack/node-core-library';

/**
 * This interface represents the raw pnpm-workspace.YAML file
 * Example:
 *  {
 *    "preferredVersionsHash": "..."
 *  }
 */
interface IRepoStateJson {
  /** A hash of the CommonVersionsConfiguration.preferredVersions field */
  preferredVersionsHash?: string;
}

/**
 * Th
 */
export class RepoStateFile {
  private static _jsonSchema: JsonSchema = JsonSchema.fromFile(
    path.join(__dirname, '../schemas/repo-state.schema.json')
  );
  private _repoStateFilePath: string;
  private _preferredVersionsHash: string | undefined;
  private _modified: boolean = false;

  private constructor(repoStateJson: IRepoStateJson | undefined, filePath: string) {
    this._repoStateFilePath = filePath;

    if (repoStateJson) {
      this._preferredVersionsHash = repoStateJson.preferredVersionsHash;
    }
  }

  /**
   * Get the absolute file path of the repo-state.json file.
   */
  public get filePath(): string {
    return this._repoStateFilePath;
  }

  /**
   * The hash of all preferred versions at the end of the last update.
   */
  public get preferredVersionsHash(): string | undefined {
    return this._preferredVersionsHash;
  }

  public set preferredVersionsHash(hash: string | undefined) {
    if (this._preferredVersionsHash !== hash) {
      this._preferredVersionsHash = hash;
      this._modified = true;
    }
  }

  /**
   * Loads the repo-state.json data from the specified file path.
   * If the file has not been created yet, then an empty object is returned.
   */
  public static loadFromFile(jsonFilename: string): RepoStateFile {
    let repoStateJson: IRepoStateJson | undefined = undefined;

    if (FileSystem.exists(jsonFilename)) {
      repoStateJson = JsonFile.loadAndValidate(jsonFilename, RepoStateFile._jsonSchema);
    }
    return new RepoStateFile(repoStateJson, jsonFilename);
  }

  /**
   * Writes the "repo-state.json" file to disk, using the filename that was passed to loadFromFile().
   */
  public saveIfModified(): boolean {
    if (this._modified) {
      JsonFile.save(this._serialize(), this._repoStateFilePath, { updateExistingFile: true });
      this._modified = false;
      return true;
    }

    return false;
  }

  private _serialize(): IRepoStateJson {
    const repoStateJson: IRepoStateJson = {
      preferredVersionsHash: this.preferredVersionsHash
    };
    return repoStateJson;
  }
}
