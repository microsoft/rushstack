// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Terminal, PackageJsonLookup } from '@rushstack/node-core-library';
import * as TRushStackCompiler from '@microsoft/rush-stack-compiler-3.7';

import { RushStackCompilerUtilities } from './RushStackCompilerUtilities';

export interface ITaskPackageResolution {
  apiExtractorPackagePath: string;
  typeScriptPackagePath: string;
  tslintPackagePath: string;
  eslintPackagePath: string;
}

export class TaskPackageResolver {
  private static _packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();

  public static resolveTaskPackages(terminal: Terminal, startingFolderPath: string): ITaskPackageResolution {
    // First, try to find the governing package.json for the local project
    const projectFolder: string | undefined = this._packageJsonLookup.tryGetPackageFolderFor(
      startingFolderPath
    );
    if (!projectFolder) {
      throw new Error('Unable to find a package.json file for the working folder: ' + startingFolderPath);
    }

    const rscPackage:
      | typeof TRushStackCompiler
      | undefined = RushStackCompilerUtilities.tryLoadRushStackCompilerPackageForFolder(
      terminal,
      projectFolder
    );
    if (!rscPackage) {
      throw new Error('Oops: ' + startingFolderPath);
    }

    return {
      apiExtractorPackagePath: rscPackage.ToolPaths.apiExtractorPackagePath,
      typeScriptPackagePath: rscPackage.ToolPaths.typescriptPackagePath,
      tslintPackagePath: rscPackage.ToolPaths.tslintPackagePath,
      eslintPackagePath: rscPackage.ToolPaths.eslintPackagePath
    };
  }
}
