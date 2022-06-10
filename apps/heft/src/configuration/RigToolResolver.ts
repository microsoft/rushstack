// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import {
  PackageJsonLookup,
  Import,
  type ITerminal,
  type INodePackageJson,
  type IPackageJson
} from '@rushstack/node-core-library';
import type { RigConfig } from '@rushstack/rig-package';

/**
 * @internal
 */
export interface IRigToolResolverOptions {
  buildFolder: string;
  projectPackageJson: IPackageJson;
  rigConfig: RigConfig;
}

/**
 * @public
 */
export class RigToolResolver {
  private _buildFolder: string;
  private _projectPackageJson: IPackageJson;
  private _rigConfig: RigConfig;
  private _packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();
  private _resolverCache: Map<string, Promise<string>> = new Map();

  /**
   * @internal
   */
  public constructor(options: IRigToolResolverOptions) {
    this._buildFolder = options.buildFolder;
    this._projectPackageJson = options.projectPackageJson;
    this._rigConfig = options.rigConfig;
  }

  public async resolvePackageAsync(packageName: string, terminal: ITerminal): Promise<string> {
    const buildFolder: string = this._buildFolder;
    const projectFolder: string | undefined = this._packageJsonLookup.tryGetPackageFolderFor(buildFolder);
    if (!projectFolder) {
      throw new Error(`Unable to find a package.json file for "${buildFolder}" `);
    }

    const cacheKey: string = `${projectFolder};${packageName}`;
    let resolutionPromise: Promise<string> | undefined = this._resolverCache.get(cacheKey);
    if (!resolutionPromise) {
      resolutionPromise = this._resolveToolPackageInnerAsync(packageName, terminal);
      this._resolverCache.set(cacheKey, resolutionPromise);
    }

    return await resolutionPromise;
  }

  private async _resolveToolPackageInnerAsync(toolPackageName: string, terminal: ITerminal): Promise<string> {
    // The following rules will apply:
    // - If the local project has a devDependency (not regular or peer dependency) on the tool,
    // that has highest precedence.
    // - OTHERWISE if there is a rig.json file, then look at the rig's package.json. Does it have a
    // regular dependency (not dev or peer dependency) on the tool? If yes, then
    // resolve the tool from the rig package folder.
    // - OTHERWISE try to resolve it from the current project.

    // See if the project has a devDependency on the package
    if (
      this._projectPackageJson.devDependencies &&
      this._projectPackageJson.devDependencies[toolPackageName]
    ) {
      try {
        const resolvedPackageFolder: string = Import.resolvePackage({
          packageName: toolPackageName,
          baseFolderPath: this._buildFolder
        });
        terminal.writeVerboseLine(`Resolved "${toolPackageName}" as a direct devDependency of the project.`);
        return resolvedPackageFolder;
      } catch (e) {
        throw new Error(
          `"${toolPackageName}" is listed as a direct devDependency of the project, but could not be resolved. ` +
            'Have dependencies been installed?'
        );
      }
    }

    const rigConfiguration: RigConfig = this._rigConfig;
    if (rigConfiguration.rigFound) {
      const rigFolder: string = rigConfiguration.getResolvedProfileFolder();
      const rigPackageJsonPath: string | undefined =
        this._packageJsonLookup.tryGetPackageJsonFilePathFor(rigFolder);
      if (!rigPackageJsonPath) {
        throw new Error(
          `Unable to resolve the package.json file for the "${rigConfiguration.rigPackageName}" rig package.`
        );
      }
      const rigPackageJson: INodePackageJson =
        this._packageJsonLookup.loadNodePackageJson(rigPackageJsonPath);
      if (rigPackageJson.dependencies && rigPackageJson.dependencies[toolPackageName]) {
        try {
          const resolvedPackageFolder: string = Import.resolvePackage({
            packageName: toolPackageName,
            baseFolderPath: path.dirname(rigPackageJsonPath)
          });
          terminal.writeVerboseLine(
            `Resolved "${toolPackageName}" as a dependency of the "${rigConfiguration.rigPackageName}" rig package.`
          );
          return resolvedPackageFolder;
        } catch (e) {
          throw new Error(
            `"${toolPackageName}" is listed as a dependency of the "${rigConfiguration.rigPackageName}" rig package, ` +
              'but could not be resolved. Have dependencies been installed?'
          );
        }
      }
    }

    try {
      const resolvedPackageFolder: string = Import.resolvePackage({
        packageName: toolPackageName,
        baseFolderPath: this._buildFolder
      });
      terminal.writeVerboseLine(`Resolved "${toolPackageName}" from ${resolvedPackageFolder}.`);
      return resolvedPackageFolder;
    } catch (e) {
      throw new Error(
        `Unable to resolve "${toolPackageName}". For more information on riggable dependency resolution, ` +
          'see https://rushstack.io/pages/heft/rig_packages/#3-riggable-dependencies'
      );
    }
  }
}
