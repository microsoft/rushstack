import { FileConstants, FileSystem, PosixModeBits } from '@rushstack/node-core-library';
import * as tar from 'tar';
import * as path from 'path';

import { RushConfigurationProject } from '../api/RushConfigurationProject';
import { RushConfiguration } from '../api/RushConfiguration';
import { RushConstants } from './RushConstants';

export class TempProjectHelper {
  _rushConfiguration: RushConfiguration;

  constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
  }

  /**
   * Deletes the existing tarball and creates a tarball for the given rush project
   */
  public createTempProjectTarball(rushProject: RushConfigurationProject): void {
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
      filter: (path: string, stat: tar.FileStat): boolean => {
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
      this._rushConfiguration.commonTempFolder,
      RushConstants.rushTempProjectsFolderName,
      `${project.unscopedTempProjectName}.tgz`
    );
  }

  public getTempProjectFolder(rushProject: RushConfigurationProject): string {
    const unscopedTempProjectName: string = rushProject.unscopedTempProjectName;
    return path.join(
      this._rushConfiguration.commonTempFolder,
      RushConstants.rushTempProjectsFolderName,
      unscopedTempProjectName
    );
  }
}
