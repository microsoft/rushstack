// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { PackageJsonLookup } from '@rushstack/node-core-library';

export interface IBuildContextParameters {
  /**
   * If unspecified, then process.cwd() is used.
   */
  currentWorkingDirectory?: string;
}

export class BuildContext {
  public readonly packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();

  /**
   * The absolute path to the folder containing package.json for the project
   * that we're building.
   * Example: "C:\MyRepo\project-1"
   */
  public readonly projectFolder: string;

  public constructor(parameters?: IBuildContextParameters) {
    let currentWorkingDirectory: string = process.cwd();
    if (parameters) {
      if (parameters.currentWorkingDirectory) {
        currentWorkingDirectory = parameters.currentWorkingDirectory;
      }
    }

    const projectFolder: string | undefined = this.packageJsonLookup
      .tryGetPackageFolderFor(currentWorkingDirectory);
    if (!projectFolder) {
      throw new Error('Unable to find a package.json for the current folder: ' + currentWorkingDirectory);
    }

    console.log(`Project folder is: "${projectFolder}"`);
    this.projectFolder = projectFolder;
  }
}
