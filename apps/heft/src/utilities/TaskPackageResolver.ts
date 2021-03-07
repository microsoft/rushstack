// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import {
  Terminal,
  PackageJsonLookup,
  FileSystem,
  JsonFile,
  INodePackageJson,
  Import
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
  private _packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();
  private _resolverCache: Map<string, Promise<ITaskPackageResolution>> = new Map<
    string,
    Promise<ITaskPackageResolution>
  >();

  public async resolveTaskPackagesAsync(
    startingPath: string,
    terminal: Terminal
  ): Promise<ITaskPackageResolution> {
    // First, make sure we have the governing package.json for the local project
    const projectFolder: string | undefined = this._packageJsonLookup.tryGetPackageFolderFor(startingPath);
    if (!projectFolder) {
      throw new Error(`Unable to find a package.json file for "${startingPath}" `);
    }

    let resolutionPromise: Promise<ITaskPackageResolution> | undefined = this._resolverCache.get(
      projectFolder
    );
    if (!resolutionPromise) {
      resolutionPromise = this._resolveTaskPackagesInnerAsync(projectFolder, terminal);
      this._resolverCache.set(projectFolder, resolutionPromise);
    }

    return await resolutionPromise;
  }

  private async _resolveTaskPackagesInnerAsync(
    projectFolder: string,
    terminal: Terminal
  ): Promise<ITaskPackageResolution> {
    // For now, we're going to rely on the tsconfig.json file's "extends" chain.  Eventually we want
    // to generalize this to resolve each task independently.

    const localTsconfigPath: string = path.join(projectFolder, 'tsconfig.json');
    const localTsconfigExists: boolean = await FileSystem.existsAsync(localTsconfigPath);
    if (!localTsconfigExists) {
      throw new Error(
        'Unable to resolve the task package paths.' +
          '  A local tsconfig.json was not found for this project: ' +
          localTsconfigPath
      );
    }

    const tsconfigBaseWithTypescriptDependencyFolder:
      | string
      | undefined = await this._findTsconfigBaseWithTypescriptDependencyAsync(
      localTsconfigPath,
      new Set<string>(),
      new Set<string>(),
      terminal
    );

    const typeScriptPackagePath: string | undefined = this._tryResolveTaskPackage(
      'typescript',
      projectFolder,
      tsconfigBaseWithTypescriptDependencyFolder,
      terminal
    );
    if (!typeScriptPackagePath) {
      // Since our entire strategy is based on tsconfig.json, we must be able to find a compiler
      throw new Error('Unable to resolve a TypeScript compiler package for ' + localTsconfigPath);
    }

    const tslintPackagePath: string | undefined = this._tryResolveTaskPackage(
      'tslint',
      projectFolder,
      tsconfigBaseWithTypescriptDependencyFolder,
      terminal
    );
    const eslintPackagePath: string | undefined = this._tryResolveTaskPackage(
      'eslint',
      projectFolder,
      tsconfigBaseWithTypescriptDependencyFolder,
      terminal
    );
    const apiExtractorPackagePath: string | undefined = this._tryResolveTaskPackage(
      '@microsoft/api-extractor',
      projectFolder,
      tsconfigBaseWithTypescriptDependencyFolder,
      terminal
    );

    return {
      apiExtractorPackagePath,
      typeScriptPackagePath,
      tslintPackagePath,
      eslintPackagePath
    };
  }

  private _tryResolveTaskPackage(
    taskPackageName: string,
    tsconfigBaseWithTypescriptDependencyFolder: string,
    rigPackageFolder: string | undefined,
    terminal: Terminal
  ): string | undefined {
    let result: string | undefined = this._tryResolvePackage(
      taskPackageName,
      tsconfigBaseWithTypescriptDependencyFolder,
      terminal,
      false
    );

    if (!result && rigPackageFolder) {
      result = this._tryResolvePackage(taskPackageName, rigPackageFolder, terminal, true);
    }

    return result;
  }

  private _tryResolvePackage(
    taskPackageName: string,
    baseFolder: string,
    terminal: Terminal,
    isRigFolder: boolean
  ): string | undefined {
    if (isRigFolder) {
      terminal.writeVerboseLine(`Attempting to resolve "${taskPackageName}" from rig folder ${baseFolder}`);
    } else {
      terminal.writeVerboseLine(`Attempting to resolve "${taskPackageName}" from ${baseFolder}`);
    }

    let resolvedPackageFolder: string | undefined;
    try {
      resolvedPackageFolder = Import.resolvePackage({
        packageName: taskPackageName,
        baseFolderPath: baseFolder
      });
    } catch (e) {
      // Ignore errors
      resolvedPackageFolder = undefined;
    }

    if (resolvedPackageFolder === undefined) {
      return undefined;
    }

    if (isRigFolder) {
      terminal.writeVerboseLine(`Resolved "${taskPackageName}" via rig package to ${resolvedPackageFolder}`);
    } else {
      terminal.writeVerboseLine(`Resolved "${taskPackageName}" to ${resolvedPackageFolder}`);
    }

    return resolvedPackageFolder;
  }

  private async _findTsconfigBaseWithTypescriptDependencyAsync(
    tsconfigPath: string,
    visitedTsconfigPaths: Set<string>,
    visitedRigPackagePaths: Set<string>,
    terminal: Terminal
  ): Promise<string | undefined> {
    if (visitedTsconfigPaths.has(tsconfigPath)) {
      throw new Error(`The file "${tsconfigPath}" has an "extends" field that creates a circular reference`);
    }
    visitedTsconfigPaths.add(tsconfigPath);

    terminal.writeVerboseLine(`Examining ${tsconfigPath}`);

    let tsconfig: ITsconfig;
    try {
      tsconfig = await JsonFile.loadAsync(tsconfigPath);
    } catch (e) {
      if (FileSystem.isNotExistError(e)) {
        throw new Error(`The referenced tsconfig.json file does not exist:\n` + tsconfigPath);
      }

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
        baseTsconfigPath = Import.resolveModule({
          modulePath: tsconfig.extends,
          baseFolderPath: path.dirname(tsconfigPath)
        });
      }

      terminal.writeVerboseLine(`Resolved "extends" path to: ${baseTsconfigPath}`);
      const result: string | undefined = await this._findTsconfigBaseWithTypescriptDependencyAsync(
        baseTsconfigPath,
        visitedTsconfigPaths,
        visitedRigPackagePaths,
        terminal
      );
      if (result) {
        // We found the rig via baseTsconfigPath, so we're done
        return result;
      }
    }

    // Look for the governing package of "tsconfigPath"
    const rigPackagePath: string | undefined = this._packageJsonLookup.tryGetPackageFolderFor(tsconfigPath);
    if (!rigPackagePath) {
      // This is unexpected; for now, we'll treat it as unsupported.  Please open a GitHub issue if you find
      // a legitimate reason to reference tsconfig.json that is not part of some package.
      throw new Error(
        'No associated package.json was found for the tsconfig.json referenced via "extends":' + tsconfigPath
      );
    }

    // For example, a "include/tsconfig-node.json" may reference the "include/tsconfig-base.json" within
    // the same rig package.  We only need to analyze the associated package.json once.
    if (!visitedRigPackagePaths.has(rigPackagePath)) {
      visitedRigPackagePaths.add(rigPackagePath);

      const rigPackageJson: INodePackageJson = this._packageJsonLookup.loadNodePackageJson(
        path.join(rigPackagePath, 'package.json')
      );

      // eslint-disable-next-line dot-notation
      if (rigPackageJson.dependencies && rigPackageJson.dependencies['typescript']) {
        terminal.writeVerboseLine(
          `Found a "typescript" dependency specified for "${rigPackageJson.name}";` +
            ` assuming it is acting as a Heft rig package: ${rigPackagePath}`
        );
        return rigPackagePath;
      }
    }

    return undefined;
  }
}
