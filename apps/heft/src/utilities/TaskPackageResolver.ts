// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as resolve from 'resolve';
import {
  Terminal,
  PackageJsonLookup,
  FileSystem,
  JsonFile,
  INodePackageJson
} from '@rushstack/node-core-library';

interface ITsconfig {
  extends?: string;
}

export interface ITaskPackageResolution {
  typeScriptPackagePath: string;
  tslintPackagePath: string | undefined;
  eslintPackagePath: string | undefined;
  apiExtractorPackagePath: string | undefined;
}

export class TaskPackageResolver {
  private static _packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();

  public static resolveTaskPackages(startingFolderPath: string, terminal: Terminal): ITaskPackageResolution {
    // First, make sure we have the governing package.json for the local project
    const projectFolder: string | undefined = this._packageJsonLookup.tryGetPackageFolderFor(
      startingFolderPath
    );
    if (!projectFolder) {
      throw new Error('Unable to find a package.json file for the working folder: ' + startingFolderPath);
    }

    // For now, we're going to rely on the tsconfig.json file's "extends" chain.  Eventually we want
    // to generalize this to resolve each task independently.

    const localTsconfigPath: string = path.join(projectFolder, 'tsconfig.json');
    if (!FileSystem.exists(localTsconfigPath)) {
      throw new Error(
        'Unable to resolve the task package paths.' +
          '  A local tsconfig.json was not found for this project: ' +
          localTsconfigPath
      );
    }

    const rigPackageFolder: string | undefined = TaskPackageResolver._locateRigPackageFolder(
      localTsconfigPath,
      new Set<string>(),
      terminal
    );

    const typeScriptPackagePath: string | undefined = TaskPackageResolver._tryResolveTaskPackage(
      'typescript',
      projectFolder,
      rigPackageFolder,
      terminal
    );
    if (!typeScriptPackagePath) {
      // Since our entire strategy is based on tsconfig.json, we must be able to find a compiler
      throw new Error('Unable to resolve a TypeScript compiler package for ' + localTsconfigPath);
    }

    const tslintPackagePath: string | undefined = TaskPackageResolver._tryResolveTaskPackage(
      'tslint',
      projectFolder,
      rigPackageFolder,
      terminal
    );
    const eslintPackagePath: string | undefined = TaskPackageResolver._tryResolveTaskPackage(
      'eslint',
      projectFolder,
      rigPackageFolder,
      terminal
    );
    const apiExtractorPackagePath: string | undefined = TaskPackageResolver._tryResolveTaskPackage(
      '@microsoft/api-extractor',
      projectFolder,
      rigPackageFolder,
      terminal
    );

    return {
      apiExtractorPackagePath,
      typeScriptPackagePath,
      tslintPackagePath,
      eslintPackagePath
    };
  }

  private static _tryResolveTaskPackage(
    taskPackageName: string,
    projectFolder: string,
    rigPackageFolder: string | undefined,
    terminal: Terminal
  ): string | undefined {
    let result: string | undefined = undefined;
    if (rigPackageFolder) {
      result = TaskPackageResolver._tryResolvePackage(taskPackageName, rigPackageFolder, terminal, true);
    }
    if (!result) {
      result = TaskPackageResolver._tryResolvePackage(taskPackageName, projectFolder, terminal, false);
    }
    return result;
  }

  private static _tryResolvePackage(
    taskPackageName: string,
    baseFolder: string,
    terminal: Terminal,
    isRigFolder: boolean
  ): string | undefined {
    try {
      if (isRigFolder) {
        terminal.writeVerboseLine(`Attempting to resolve "${taskPackageName}" from rig folder ${baseFolder}`);
      } else {
        terminal.writeVerboseLine(`Attempting to resolve "${taskPackageName}" from ${baseFolder}`);
      }
      const resolvedPackageJsonFile: string = resolve.sync(taskPackageName, {
        basedir: baseFolder,
        preserveSymlinks: false,
        packageFilter: (packageJson: INodePackageJson) => {
          return {
            ...packageJson,
            // ensure "main" points to a file in the package root folder
            main: 'package.json'
          };
        }
      });
      const resolvedPackageFolder: string = path.dirname(resolvedPackageJsonFile);

      if (isRigFolder) {
        terminal.writeVerboseLine(
          `Resolved "${taskPackageName}" via rig package to ${resolvedPackageFolder}`
        );
      } else {
        terminal.writeVerboseLine(`Resolved "${taskPackageName}" to ${resolvedPackageFolder}`);
      }

      return resolvedPackageFolder;
    } catch (e) {
      // Ignore errors
    }
    return undefined;
  }

  private static _locateRigPackageFolder(
    tsconfigPath: string,
    visitedTsconfigPaths: Set<string>,
    terminal: Terminal
  ): string | undefined {
    if (visitedTsconfigPaths.has(tsconfigPath)) {
      throw new Error(`The file "${tsconfigPath}" has an "extends" field that creates a circular reference`);
    }
    visitedTsconfigPaths.add(tsconfigPath);

    terminal.writeVerboseLine(`Examining ${tsconfigPath}`);

    if (!FileSystem.exists(tsconfigPath)) {
      throw new Error(`The referenced tsconfig.json file does not exist: ` + tsconfigPath);
    }

    let tsconfig: ITsconfig;
    try {
      tsconfig = JsonFile.load(tsconfigPath);
    } catch (e) {
      throw new Error(`Error parsing tsconfig.json: ${e}\n` + tsconfigPath);
    }

    if (tsconfig.extends) {
      // Follow the tsconfig.extends field:
      let baseTsconfigPath: string;
      if (path.isAbsolute(tsconfig.extends)) {
        // Absolute path
        terminal.writeVerboseLine(
          `Following a tsconfig.json "extends" property "${tsconfig.extends}" that is an absolute path.`
        );
        baseTsconfigPath = tsconfig.extends;
      } else if (tsconfig.extends.match(/^\./)) {
        // Relative path
        terminal.writeVerboseLine(
          `Following a tsconfig.json "extends" property "${tsconfig.extends}" that is a relative path.`
        );
        baseTsconfigPath = path.resolve(path.dirname(tsconfigPath), tsconfig.extends);
      } else {
        terminal.writeVerboseLine(
          `Following a tsconfig.json "extends" property "${tsconfig.extends}" that is a package path.`
        );
        // Package path
        baseTsconfigPath = resolve.sync(tsconfig.extends, {
          basedir: path.dirname(tsconfigPath),
          preserveSymlinks: false,
          packageFilter: (packageJson: INodePackageJson) => {
            return {
              ...packageJson,
              // ensure "main" points to a file in the package root folder
              main: 'package.json'
            };
          }
        });
      }

      terminal.writeVerboseLine(`Resolved "extends" path to: ${baseTsconfigPath}`);
      const result: string | undefined = TaskPackageResolver._locateRigPackageFolder(
        baseTsconfigPath,
        visitedTsconfigPaths,
        terminal
      );
      if (result) {
        // We found the rig via baseTsconfigPath, so we're done
        return result;
      }
    }

    // Look for the governing package of "tsconfigPath"
    const rigPackagePath: string | undefined = TaskPackageResolver._packageJsonLookup.tryGetPackageFolderFor(
      tsconfigPath
    );
    if (!rigPackagePath) {
      // This is unexpected; for now, we'll treat it as unsupported.  Please open a GitHub issue if you find
      // a legitimate reason to reference tsconfig.json that is not part of some package.
      throw new Error(
        'No associated package.json was found for the tsconfig.json referenced via "extends":' + tsconfigPath
      );
    }

    const rigPackageJson: INodePackageJson = TaskPackageResolver._packageJsonLookup.loadNodePackageJson(
      path.join(rigPackagePath, 'package.json')
    );

    // eslint-disable-next-line dot-notation
    if (rigPackageJson.dependencies && rigPackageJson.dependencies['typescript']) {
      terminal.writeVerboseLine(
        `Found a "typescript" dependency specified for "${rigPackageJson.name}";` +
          ` assuming it is acting as a Heft rig package: ` +
          rigPackagePath
      );
      return rigPackagePath;
    }

    return undefined;
  }
}
