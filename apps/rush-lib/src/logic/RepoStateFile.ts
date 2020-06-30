// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { FileSystem, JsonFile, JsonSchema, NewlineKind } from '@rushstack/node-core-library';

import { RushConfiguration } from '../api/RushConfiguration';
import { PnpmShrinkwrapFile } from './pnpm/PnpmShrinkwrapFile';
import { CommonVersionsConfiguration } from '../api/CommonVersionsConfiguration';

/**
 * This interface represents the raw pnpm-workspace.YAML file
 * Example:
 *  {
 *    "preferredVersionsHash": "..."
 *  }
 */
interface IRepoStateJson {
  /**
   * A hash of the PNPM shrinkwrap file contents
   */
  pnpmShrinkwrapHash?: string;
  /**
   * A hash of the CommonVersionsConfiguration.preferredVersions field
   */
  preferredVersionsHash?: string;
}

/**
 * This file is used to track the state of various Rush-related features. It is generated
 * and updated by Rush.
 */
export class RepoStateFile {
  private static _jsonSchema: JsonSchema = JsonSchema.fromFile(
    path.join(__dirname, '../schemas/repo-state.schema.json')
  );
  private _repoStateFilePath: string;
  private _variant: string | undefined;
  private _pnpmShrinkwrapHash: string | undefined;
  private _preferredVersionsHash: string | undefined;
  private _modified: boolean = false;

  private constructor(
    repoStateJson: IRepoStateJson | undefined,
    filePath: string,
    variant: string | undefined
  ) {
    this._repoStateFilePath = filePath;
    this._variant = variant;

    if (repoStateJson) {
      this._pnpmShrinkwrapHash = repoStateJson.pnpmShrinkwrapHash;
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
   * The hash of the pnpm shrinkwrap file at the end of the last update.
   */
  public get pnpmShrinkwrapHash(): string | undefined {
    return this._pnpmShrinkwrapHash;
  }

  /**
   * The hash of all preferred versions at the end of the last update.
   */
  public get preferredVersionsHash(): string | undefined {
    return this._preferredVersionsHash;
  }

  /**
   * Loads the repo-state.json data from the specified file path.
   * If the file has not been created yet, then an empty object is returned.
   */
  public static loadFromFile(jsonFilename: string, variant: string | undefined): RepoStateFile {
    let repoStateJson: IRepoStateJson | undefined = undefined;
    try {
      repoStateJson = JsonFile.loadAndValidate(jsonFilename, RepoStateFile._jsonSchema);
    } catch (error) {
      if (!FileSystem.isNotExistError(error)) {
        throw error;
      }
    }

    return new RepoStateFile(repoStateJson, jsonFilename, variant);
  }

  public refreshState(rushConfiguration: RushConfiguration): boolean {
    // Only support saving the pnpm shrinkwrap hash if it was enabled
    const preventShrinkwrapChanges: boolean =
      rushConfiguration.packageManager === 'pnpm' &&
      rushConfiguration.pnpmOptions &&
      rushConfiguration.pnpmOptions.preventManualShrinkwrapChanges;
    if (preventShrinkwrapChanges) {
      const pnpmShrinkwrapFile: PnpmShrinkwrapFile | undefined = PnpmShrinkwrapFile.loadFromFile(
        rushConfiguration.getCommittedShrinkwrapFilename(this._variant),
        rushConfiguration.pnpmOptions
      );
      if (pnpmShrinkwrapFile) {
        const shrinkwrapFileHash: string = pnpmShrinkwrapFile.getShrinkwrapHash();
        if (this._pnpmShrinkwrapHash !== shrinkwrapFileHash) {
          this._pnpmShrinkwrapHash = shrinkwrapFileHash;
          this._modified = true;
        }
      }
    } else if (this._pnpmShrinkwrapHash !== undefined) {
      this._pnpmShrinkwrapHash = undefined;
      this._modified = true;
    }

    // Currently, only support saving the preferred versions hash if using workspaces
    const useWorkspaces: boolean =
      rushConfiguration.pnpmOptions && rushConfiguration.pnpmOptions.useWorkspaces;
    if (useWorkspaces) {
      const commonVersions: CommonVersionsConfiguration = rushConfiguration.getCommonVersions(this._variant);
      const preferredVersionsHash: string = commonVersions.getPreferredVersionsHash();
      if (this._preferredVersionsHash !== preferredVersionsHash) {
        this._preferredVersionsHash = preferredVersionsHash;
        this._modified = true;
      }
    } else if (this._preferredVersionsHash !== undefined) {
      this._preferredVersionsHash = undefined;
      this._modified = true;
    }

    return this._saveIfModified();
  }

  /**
   * Writes the "repo-state.json" file to disk, using the filename that was passed to loadFromFile().
   */
  private _saveIfModified(): boolean {
    if (this._modified) {
      const content: string =
        '// DO NOT MODIFY THIS FILE. It is generated and used by Rush.' +
        `${NewlineKind.Lf}${this._serialize()}`;
      FileSystem.writeFile(this._repoStateFilePath, content);
      this._modified = false;
      return true;
    }

    return false;
  }

  private _serialize(): string {
    const repoStateJson: IRepoStateJson = {
      pnpmShrinkwrapHash: this.pnpmShrinkwrapHash,
      preferredVersionsHash: this.preferredVersionsHash
    };
    return JsonFile.stringify(repoStateJson, { newlineConversion: NewlineKind.Lf });
  }
}
