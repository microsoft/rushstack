// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

const SRC_FOLDER_NAME: string = 'src';
const LIB_FOLDER_NAME: string = 'lib';
const DIST_FOLDER_NAME: string = 'dist';
const TEMP_FOLDER_NAME: string = 'temp';

/**
 * @beta
 */
export class StandardBuildFolders {
  private _projectFolderPath: string;
  private _srcFolderPath: string;
  private _libFolderPath: string;
  private _distFolderPath: string;
  private _tempFolderPath: string;

  public constructor(projectFolderPath: string) {
    this._projectFolderPath = projectFolderPath;
  }

  public get projectFolderPath(): string {
    return this._projectFolderPath;
  }

  public get srcFolderPath(): string {
    if (!this._srcFolderPath) {
      this._srcFolderPath = path.join(this._projectFolderPath, SRC_FOLDER_NAME);
    }

    return this._srcFolderPath;
  }

  public get libFolderPath(): string {
    if (!this._libFolderPath) {
      this._libFolderPath = path.join(this._projectFolderPath, LIB_FOLDER_NAME);
    }

    return this._libFolderPath;
  }

  public get distFolderPath(): string {
    if (!this._distFolderPath) {
      this._distFolderPath = path.join(this._projectFolderPath, DIST_FOLDER_NAME);
    }

    return this._distFolderPath;
  }

  public get tempFolderPath(): string {
    if (!this._tempFolderPath) {
      this._tempFolderPath = path.join(this._projectFolderPath, TEMP_FOLDER_NAME);
    }

    return this._tempFolderPath;
  }
}
