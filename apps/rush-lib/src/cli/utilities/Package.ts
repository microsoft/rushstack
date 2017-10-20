// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import readPackageTree = require('read-package-tree');
import { JsonFile } from '@microsoft/node-core-library';

import { IPackageJson } from '../../index';

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

/**
 * Represents a "@rush-temp" scoped package, which has our additional custom field
 * for tracking the dependency graph.
 */
export interface IRushTempPackageJson extends IPackageJson {
  /**
   * An extra setting written into package.json for temp packages, to track
   * references to locally built projects.
   */
  rushDependencies?: { [key: string]: string };
}

/**
 * Represents an NPM package being processed by the "rush link" algorithm.
 */
export default class Package {
  /**
   * The "name" field from package.json
   */
  public name: string;

  /**
   * The "version" field from package.json
   */
  public version: string;

  /**
   * Names of packages that we explicitly depend on.  The actual dependency
   * package may be found in this.children, or possibly in this.children of
   * one of the parents.
   * If a dependency is listed in the "optionalDependencies" section of package.json
   * then its name here will be prepended with a "?" character, which means that Rush
   * will not report an error if the module cannot be found in the Common folder.
   */
  public dependencies: IPackageDependency[];

  /**
   * The absolute path to the folder that contains package.json.
   */
  public folderPath: string;

  /**
   * The parent package, or undefined if this is the root of the tree.
   */
  public parent: Package | undefined;

  /**
   * If this is a local path that we are planning to symlink to a target folder,
   * then symlinkTargetFolderPath keeps track of the intended target.
   */
  public symlinkTargetFolderPath: string | undefined = undefined;

  /**
   * Packages that were placed in node_modules subfolders of this package.
   * The child packages are not necessarily dependencies of this package.
   */
  public children: Package[];
  private _childrenByName: Map<string, Package>;

  /**
   * Recursive constructs a tree of Package objects using information returned
   * by the "read-package-tree" library.
   */
  public static createFromNpm(npmPackage: readPackageTree.PackageNode): Package {
    if (npmPackage.error) {
      throw Error(`Failed to parse package.json for ${path.basename(npmPackage.path)}: `
        + npmPackage.error.message);
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

    const newPackage: Package = new Package(
      npmPackage.package.name,
      npmPackage.package.version,
      dependencies,
      // NOTE: We don't use packageNode.realpath here, because if "npm unlink" was
      // performed without redoing "rush link", then a broken symlink is better than
      // a symlink to the wrong thing.
      npmPackage.path
    );

    for (const child of npmPackage.children) {
      newPackage.addChild(Package.createFromNpm(child));
    }

    return newPackage;
  }

  /**
   * Used by "npm link" when creating a Package object that represents symbolic links to be created.
   */
  public static createLinkedPackage(name: string, version: string, dependencies: IPackageDependency[],
    folderPath: string): Package {
    return new Package(name, version, dependencies, folderPath);
  }

  /**
   * Used by "npm link" to simulate a temp project that is missing from the common/node_modules
   * folder (e.g. because it was added after the shrinkwrap file was regenerated).
   * @param packageJsonFilename - Filename of the source package.json
   *        Example: c:\MyRepo\common\temp\projects\project1\package.json
   * @param targetFolderName - Filename where it should have been installed
   *        Example: c:\MyRepo\common\temp\node_modules\@rush-temp\project1
   */
  public static createVirtualTempPackage(packageJsonFilename: string, installFolderName: string): Package {
    const packageJson: IPackageJson = JsonFile.load(packageJsonFilename);
    const npmPackage: readPackageTree.PackageNode = {
      children: [],
      error: undefined,
      id: 0,
      isLink: false,
      package: packageJson,
      parent: undefined,
      path: installFolderName,
      realpath: installFolderName
    };
    return Package.createFromNpm(npmPackage);
  }

  public get nameAndVersion(): string {
    let result: string = '';

    if (this.name) {
      result += this.name;
    } else {
      result += '(missing name)';
    }
    result += '@';
    if (this.version) {
      result += this.version;
    } else {
      result += '(missing version)';
    }
    return result;
  }

  public addChild(child: Package): void {
    if (child.parent) {
      throw Error('Child already has a parent');
    }
    if (this._childrenByName.has(child.name)) {
      throw Error('Child already exists');
    }
    child.parent = this;
    this.children.push(child);
    this._childrenByName.set(child.name, child);
  }

  public getChildByName(childPackageName: string): Package | undefined {
    return this._childrenByName.get(childPackageName);
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
   * root for the tree; the cyclicDependencyProjects feature uses this to isolate
   * certain devDependencies in their own subtree.
   */
  public resolveOrCreate(dependencyName: string, cyclicSubtreeRoot?: Package): IResolveOrCreateResult {

    let currentParent: Package = this;
    let parentForCreate: Package | undefined = undefined;

    // tslint:disable-next-line:no-constant-condition
    while (true) {
      // Does any child match?
      for (const child of currentParent.children) {
        if (child.name === dependencyName) {
          // One of the children matched.  Note that parentForCreate may be
          // undefined, e.g. if an immediate child is found but has the wrong version,
          // then we have no place in the tree to create another version.
          return { found: child, parentForCreate };
        }
      }

      // If no child matched, then make this node the "parentForCreate" where we
      // could add a missing dependency.
      parentForCreate = currentParent;

      if (!currentParent.parent
        || (cyclicSubtreeRoot && currentParent === cyclicSubtreeRoot)) {
        // We reached the root without finding a match
        // parentForCreate will be the root.
        return { found: undefined, parentForCreate };
      }

      // Continue walking upwards.
      currentParent = currentParent.parent;
    }
  }

  /**
   * Searches the node_modules hierarchy for the nearest matching package with the
   * given name.  If no match is found, then undefined is returned.
   */
  public resolve(dependencyName: string): Package | undefined {
    return this.resolveOrCreate(dependencyName).found;
  }

  public printTree(indent?: string): void {
    if (!indent) {
      indent = '';
    }
    console.log(indent + this.nameAndVersion);
    for (const child of this.children) {
      child.printTree(indent + '  ');
    }
  }

  private constructor(name: string, version: string, dependencies: IPackageDependency[], folderPath: string) {
    this.name = name;
    this.version = version;
    this.dependencies = dependencies.slice(0); // clone the array
    this.folderPath = folderPath;
    this.parent = undefined;
    this.children = [];
    this._childrenByName = new Map<string, Package>();
  }
}

/**
 * Used by the "rush link" algorithm when doing NPM package resolution.
 */
export interface IResolveOrCreateResult {
  found: Package | undefined;
  parentForCreate: Package | undefined;
}
