// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import * as tar from 'tar';

import { FileConstants, FileSystem, PosixModeBits } from '@rushstack/node-core-library';

import type { RushConfigurationProject } from '../api/RushConfigurationProject';
import type { RushConfiguration } from '../api/RushConfiguration';
import { RushConstants } from './RushConstants';
import type { Subspace } from '../api/Subspace';

// The PosixModeBits are intended to be used with bitwise operations.
/* eslint-disable no-bitwise */

export class TempProjectHelper {
  private _rushConfiguration: RushConfiguration;
  private _subspace: Subspace;

  public constructor(rushConfiguration: RushConfiguration, subspace: Subspace) {
    this._rushConfiguration = rushConfiguration;
    this._subspace = subspace;
  }

  /**
   * Deletes the existing tarball and creates a tarball for the given rush project
   */
  public createTempProjectTarball(rushProject: RushConfigurationProject): void {
    FileSystem.ensureFolder(path.resolve(this._subspace.getSubspaceTempFolderPath(), 'projects'));
    const tarballFile: string = this.getTarballFilePath(rushProject);
    const tempProjectFolder: string = this.getTempProjectFolder(rushProject);

    FileSystem.deleteFile(tarballFile);

    // NPM expects the root of the tarball to have a directory called 'package'
    const npmPackageFolder: string = 'package';

    const tarOptions: tar.CreateOptions = {
      gzip: true,
      file: tarballFile,
      cwd: tempProjectFolder,
      portable: true,
      noMtime: true,
      noPax: true,
      sync: true,
      prefix: npmPackageFolder,
      filter: (tarPath: string, stat: tar.FileStat): boolean => {
        if (
          !this._rushConfiguration.experimentsConfiguration.configuration.noChmodFieldInTarHeaderNormalization
        ) {
          stat.mode =
            (stat.mode & ~0x1ff) | PosixModeBits.AllRead | PosixModeBits.UserWrite | PosixModeBits.AllExecute;
        }
        return true;
      }
    } as tar.CreateOptions;
    // create the new tarball
    tar.create(tarOptions, [FileConstants.PackageJson]);
  }

  /**
   * Gets the path to the tarball
   * Example: "C:\MyRepo\common\temp\projects\my-project-2.tgz"
   */
  public getTarballFilePath(project: RushConfigurationProject): string {
    return path.join(
      this._subspace.getSubspaceTempFolderPath(),
      RushConstants.rushTempProjectsFolderName,
      `${project.unscopedTempProjectName}.tgz`
    );
  }

  public getTempProjectFolder(rushProject: RushConfigurationProject): string {
    const unscopedTempProjectName: string = rushProject.unscopedTempProjectName;
    return path.join(
      this._subspace.getSubspaceTempFolderPath(),
      RushConstants.rushTempProjectsFolderName,
      unscopedTempProjectName
    );
  }
}
