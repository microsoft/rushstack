// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type readPackageTree from 'read-package-tree';

import { JsonFile, type IPackageJson } from '@rushstack/node-core-library';

import { BasePackage, type IRushTempPackageJson } from '../base/BasePackage';

/**
 * Used by the linking algorithm when doing NPM package resolution.
 */
export interface IResolveOrCreateResult {
  found: BasePackage | undefined;
  parentForCreate: BasePackage | undefined;
}

/**
 * The type of dependency; used by IPackageDependency.
 */
export enum PackageDependencyKind {
  Normal,
  /**
   * The dependency was listed in the optionalDependencies section of package.json.
   */
  Optional,

  /**
   * The dependency should be a symlink to a project that is locally built by Rush..
   */
  LocalLink
}

export interface IPackageDependency {
  /**
   * The name of the dependency
   */
  name: string;
  /**
   * The requested version, which may be a pattern such as "^1.2.3"
   */
  versionRange: string;

  /**
   * The kind of dependency
   */
  kind: PackageDependencyKind;
}

export class NpmPackage extends BasePackage {
  /**
   * Names of packages that we explicitly depend on.  The actual dependency
   * package may be found in this.children, or possibly in this.children of
   * one of the parents.
   * If a dependency is listed in the "optionalDependencies" section of package.json
   * then its name here will be prepended with a "?" character, which means that Rush
   * will not report an error if the module cannot be found in the Common folder.
   */
  public dependencies: IPackageDependency[];

  private constructor(
    name: string,
    version: string | undefined,
    dependencies: IPackageDependency[],
    folderPath: string
  ) {
    super(name, version, folderPath, undefined);
    this.dependencies = dependencies.slice(0); // clone the array
    this.parent = undefined;
  }

  /**
   * Used by "npm link" when creating a Package object that represents symbolic links to be created.
   */
  public static createLinkedNpmPackage(
    name: string,
    version: string | undefined,
    dependencies: IPackageDependency[],
    folderPath: string
  ): NpmPackage {
    return new NpmPackage(name, version, dependencies, folderPath);
  }

  /**
   * Used by "npm link" to simulate a temp project that is missing from the common/node_modules
   * folder (e.g. because it was added after the shrinkwrap file was regenerated).
   * @param packageJsonFilename - Filename of the source package.json
   *        Example: `C:\MyRepo\common\temp\projects\project1\package.json`
   * @param targetFolderName - Filename where it should have been installed
   *        Example: `C:\MyRepo\common\temp\node_modules\@rush-temp\project1`
   */
  public static createVirtualTempPackage(packageJsonFilename: string, installFolderName: string): NpmPackage {
    const packageJson: IPackageJson = JsonFile.load(packageJsonFilename);
    const npmPackage: readPackageTree.Node = {
      children: [],
      error: null,
      id: 0,
      isLink: false,
      package: packageJson,
      parent: null,
      path: installFolderName,
      realpath: installFolderName
    };
    return NpmPackage.createFromNpm(npmPackage);
  }

  /**
   * Recursive constructs a tree of NpmPackage objects using information returned
   * by the "read-package-tree" library.
   */
  public static createFromNpm(npmPackage: readPackageTree.Node): NpmPackage {
    if (npmPackage.error) {
      throw new Error(
        `Failed to parse package.json for ${path.basename(npmPackage.path)}: ${npmPackage.error.message}`
      );
    }

    let dependencies: IPackageDependency[] = [];
    const dependencyNames: Set<string> = new Set<string>();
    const packageJson: IRushTempPackageJson = npmPackage.package;

    if (packageJson.optionalDependencies) {
      for (const dependencyName of Object.keys(packageJson.optionalDependencies)) {
        if (!dependencyNames.has(dependencyName)) {
          dependencyNames.add(dependencyName);
          dependencies.push({
            name: dependencyName,
            versionRange: packageJson.optionalDependencies[dependencyName],
            kind: PackageDependencyKind.Optional
          });
        }
      }
    }
    if (packageJson.dependencies) {
      for (const dependencyName of Object.keys(packageJson.dependencies)) {
        if (!dependencyNames.has(dependencyName)) {
          dependencyNames.add(dependencyName);
          dependencies.push({
            name: dependencyName,
            versionRange: packageJson.dependencies[dependencyName],
            kind: PackageDependencyKind.Normal
          });
        }
      }
    }
    if (packageJson.rushDependencies) {
      for (const dependencyName of Object.keys(packageJson.rushDependencies)) {
        if (!dependencyNames.has(dependencyName)) {
          dependencyNames.add(dependencyName);
          dependencies.push({
            name: dependencyName,
            versionRange: packageJson.dependencies![dependencyName],
            kind: PackageDependencyKind.LocalLink
          });
        }
      }
    }

    dependencies = dependencies.sort((a, b) => a.name.localeCompare(b.name));

    const newPackage: NpmPackage = new NpmPackage(
      npmPackage.package.name,
      npmPackage.package.version,
      dependencies,
      // NOTE: We don't use packageNode.realpath here, because if "npm unlink" was
      // performed without redoing "rush link", then a broken symlink is better than
      // a symlink to the wrong thing.
      npmPackage.path
    );

    for (const child of npmPackage.children) {
      newPackage.addChild(NpmPackage.createFromNpm(child));
    }

    return newPackage;
  }

  /**
   * Searches the node_modules hierarchy for the nearest matching package with the
   * given name.  Note that the nearest match may have an incompatible version.
   * If a match is found, then the "found" result will not be undefined.
   * In either case, the parentForCreate result indicates where the missing
   * dependency can be added, i.e. if the requested dependency was not found
   * or was found with an incompatible version.
   *
   * "cyclicSubtreeRoot" is a special optional parameter that specifies a different
   * root for the tree; the decoupledLocalDependencies feature uses this to isolate
   * certain devDependencies in their own subtree.
   */
  public resolveOrCreate(dependencyName: string, cyclicSubtreeRoot?: NpmPackage): IResolveOrCreateResult {
    let currentParent: NpmPackage = this;
    let parentForCreate: NpmPackage | undefined = undefined;

    for (;;) {
      // Does any child match?
      for (const child of currentParent.children) {
        // The package.json name can differ from the installation folder name, in the case of an NPM package alias
        // such as this:
        //
        // "dependencies": {
        //   "@alias-scope/alias-name": "npm:target-name@^1.2.3"
        // }
        //
        // Thus we need to compare child.installedName instead of child.name:
        if (child.installedName === dependencyName) {
          // One of the children matched.  Note that parentForCreate may be
          // undefined, e.g. if an immediate child is found but has the wrong version,
          // then we have no place in the tree to create another version.
          return { found: child, parentForCreate };
        }
      }

      // If no child matched, then make this node the "parentForCreate" where we
      // could add a missing dependency.
      parentForCreate = currentParent;

      if (!currentParent.parent || (cyclicSubtreeRoot && currentParent === cyclicSubtreeRoot)) {
        // We reached the root without finding a match
        // parentForCreate will be the root.
        return { found: undefined, parentForCreate };
      }

      // Continue walking upwards.
      currentParent = currentParent.parent as NpmPackage;
    }
  }

  /**
   * Searches the node_modules hierarchy for the nearest matching package with the
   * given name.  If no match is found, then undefined is returned.
   */
  public resolve(dependencyName: string): NpmPackage | undefined {
    return this.resolveOrCreate(dependencyName).found as NpmPackage;
  }
}
