// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import {
  PackageJsonLookup,
  Import,
  type INodePackageJson,
  type IPackageJson
} from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';
import type { IRigConfig } from '@rushstack/rig-package';

/**
 * Rig resolves requested tools from the project's Heft rig.
 *
 * @remarks For more information on rig resolution, see
 * https://rushstack.io/pages/heft/rig_packages/#3-riggable-dependencies
 *
 * @public
 */
export interface IRigPackageResolver {
  resolvePackageAsync(packageName: string, terminal: ITerminal): Promise<string>;
}

/**
 * Options for creating a RigPackageResolver.
 */
export interface IRigPackageResolverOptions {
  buildFolder: string;
  projectPackageJson: IPackageJson;
  rigConfig: IRigConfig;
}

/**
 * Rig resolves requested tools from the project's Heft rig.
 */
export class RigPackageResolver implements IRigPackageResolver {
  private readonly _buildFolder: string;
  private readonly _projectPackageJson: IPackageJson;
  private readonly _rigConfig: IRigConfig;
  private readonly _packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();
  private readonly _resolverCache: Map<string, Promise<string>> = new Map();

  public constructor(options: IRigPackageResolverOptions) {
    this._buildFolder = options.buildFolder;
    this._projectPackageJson = options.projectPackageJson;
    this._rigConfig = options.rigConfig;
  }

  /**
   * Rig resolve the path to a specific package.
   *
   * The following rules will apply when rig resolving a package:
   * - If the local project has a devDependency (not regular or peer dependency) on the tool,
   *   that has highest precedence.
   * - OTHERWISE if there is a rig.json file, then look at the rig's package.json. Does it have a
   *   regular dependency (not dev or peer dependency) on the tool? If yes, then
   *   resolve the tool from the rig package folder.
   * - OTHERWISE try to resolve it from the current project.
   */
  public async resolvePackageAsync(packageName: string, terminal: ITerminal): Promise<string> {
    const buildFolder: string = this._buildFolder;
    const projectFolder: string | undefined = this._packageJsonLookup.tryGetPackageFolderFor(buildFolder);
    if (!projectFolder) {
      throw new Error(`Unable to find a package.json file for "${buildFolder}".`);
    }

    const cacheKey: string = `${projectFolder};${packageName}`;
    let resolutionPromise: Promise<string> | undefined = this._resolverCache.get(cacheKey);
    if (!resolutionPromise) {
      resolutionPromise = this._resolvePackageInnerAsync(packageName, terminal);
      this._resolverCache.set(cacheKey, resolutionPromise);
    }

    return await resolutionPromise;
  }

  private async _resolvePackageInnerAsync(toolPackageName: string, terminal: ITerminal): Promise<string> {
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
        terminal.writeVerboseLine(
          `Resolved ${JSON.stringify(toolPackageName)} as a direct devDependency of the project.`
        );
        return resolvedPackageFolder;
      } catch (e) {
        throw new Error(
          `${JSON.stringify(toolPackageName)} is listed as a direct devDependency of the project, but ` +
            'could not be resolved. Have dependencies been installed?'
        );
      }
    }

    // See if the project rig has a regular dependency on the package
    const rigConfiguration: IRigConfig = this._rigConfig;
    if (rigConfiguration.rigFound) {
      const rigFolder: string = rigConfiguration.getResolvedProfileFolder();
      const rigPackageJsonPath: string | undefined =
        this._packageJsonLookup.tryGetPackageJsonFilePathFor(rigFolder);
      if (!rigPackageJsonPath) {
        throw new Error(
          'Unable to resolve the package.json file for the ' +
            `${JSON.stringify(rigConfiguration.rigPackageName)} rig package.`
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
            `Resolved ${JSON.stringify(toolPackageName)} as a dependency of the ` +
              `${JSON.stringify(rigConfiguration.rigPackageName)} rig package.`
          );
          return resolvedPackageFolder;
        } catch (e) {
          throw new Error(
            `${JSON.stringify(toolPackageName)} is listed as a dependency of the ` +
              `${JSON.stringify(rigConfiguration.rigPackageName)} rig package, but could not be resolved. ` +
              'Have dependencies been installed?'
          );
        }
      }
    }

    // Last attempt, try to resolve it from the current project using node resolution
    try {
      const resolvedPackageFolder: string = Import.resolvePackage({
        packageName: toolPackageName,
        baseFolderPath: this._buildFolder
      });
      terminal.writeVerboseLine(
        `Resolved ${JSON.stringify(toolPackageName)} from "${resolvedPackageFolder}".`
      );
      return resolvedPackageFolder;
    } catch (e) {
      throw new Error(
        `Unable to resolve ${JSON.stringify(toolPackageName)}. For more information on riggable ` +
          'dependency resolution, see https://rushstack.io/pages/heft/rig_packages/#3-riggable-dependencies'
      );
    }
  }
}
