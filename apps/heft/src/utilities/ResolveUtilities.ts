// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { sync } from 'resolve';
import * as path from 'path';
import { FileSystem, PackageJsonLookup } from '@rushstack/node-core-library';

const packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();

export interface IResolvePackageOptions {
  doNotResolveSymlinks: boolean;
}

export class ResolveUtilities {
  /**
   * Gets the path of a given package name from the perspective of a given path
   */
  public static resolvePackage(
    packageName: string,
    rootPath: string,
    options: Partial<IResolvePackageOptions> = {}
  ): string {
    options = {
      doNotResolveSymlinks: false,
      ...options
    };

    let normalizedRootPath: string = options.doNotResolveSymlinks
      ? rootPath
      : FileSystem.getRealPath(rootPath);
    normalizedRootPath = packageJsonLookup.tryGetPackageFolderFor(normalizedRootPath) || normalizedRootPath;

    try {
      return path.dirname(
        sync(packageName, {
          basedir: normalizedRootPath,
          packageFilter: (pkg: { main: string }): { main: string } => {
            pkg.main = 'package.json';
            return pkg;
          }
        })
      );
    } catch (e1) {
      try {
        // If we fail, see if we're trying to resolve to the current package
        const currentPackageJson: { name: string } = require(path.join(normalizedRootPath, 'package.json'));
        if (currentPackageJson.name === packageName) {
          return normalizedRootPath;
        } else {
          throw e1;
        }
      } catch (e2) {
        throw e1;
      }
    }
  }

  /**
   * Resolves a path in a package, relative to another path.
   */
  public static resolvePackagePath(
    packagePath: string,
    rootPath: string,
    options?: Partial<IResolvePackageOptions>
  ): string {
    if (packagePath.startsWith('.')) {
      // This looks like a conventional relative path
      return path.resolve(rootPath, packagePath);
    }

    let lastSlashIndex: number;
    if (packagePath.startsWith('@')) {
      // This looks like a scoped package name
      lastSlashIndex = packagePath.indexOf('/', packagePath.indexOf('/') + 1);
    } else {
      lastSlashIndex = packagePath.indexOf('/');
    }

    let packageName: string;
    let pathInsidePackage: string;
    if (lastSlashIndex === -1) {
      // This looks like a package name without a path
      packageName = packagePath;
      pathInsidePackage = '';
    } else {
      packageName = packagePath.substr(0, lastSlashIndex);
      pathInsidePackage = packagePath.substr(lastSlashIndex + 1);
    }

    const resolvedPackagePath: string = ResolveUtilities.resolvePackage(packageName, rootPath, options);
    return path.resolve(resolvedPackagePath, pathInsidePackage);
  }
}
