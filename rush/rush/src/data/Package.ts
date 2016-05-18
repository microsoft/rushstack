/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */

import * as path from 'path';

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
   * Whether the dependency was listed in the optionalDependencies section of package.json.
   */
  isOptional: boolean;
}

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
  public parent: Package;

  /**
   * If this is a local path that we are planning to symlink to a target folder,
   * then symlinkTargetFolderPath keeps track of the intended target.
   */
  public symlinkTargetFolderPath: string = undefined;

  /**
   * If this was loaded using createFromNpm(), then the parsed package.json is stored here.
   */
  public originalPackageJson: PackageJson = undefined;

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
  public static createFromNpm(npmPackage: PackageNode): Package {
    if (npmPackage.error) {
      throw Error(`Failed to parse package.json for ${path.basename(npmPackage.path)}: `
        + npmPackage.error.message);
    }

    let dependencies: IPackageDependency[] = [];
    const dependencyNames: Set<string> = new Set<string>();
    const packageJson: PackageJson = npmPackage.package;

    if (packageJson.optionalDependencies) {
      for (const dependencyName of Object.keys(packageJson.optionalDependencies)) {
        if (!dependencyNames.has(dependencyName)) {
          dependencyNames.add(dependencyName);
          dependencies.push({
            isOptional: true,
            name: dependencyName,
            versionRange: packageJson.optionalDependencies[dependencyName]
          });
        }
      }
    }
    if (packageJson.dependencies) {
      for (const dependencyName of Object.keys(packageJson.dependencies)) {
        if (!dependencyNames.has(dependencyName)) {
          dependencyNames.add(dependencyName);
          dependencies.push({
            isOptional: false,
            name: dependencyName,
            versionRange: packageJson.dependencies[dependencyName]
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

    newPackage.originalPackageJson = packageJson;

    for (const child of npmPackage.children) {
      newPackage.addChild(Package.createFromNpm(child));
    }

    return newPackage;
  }

  constructor(name: string, version: string, dependencies: IPackageDependency[], folderPath: string) {

    this.name = name;
    this.version = version;
    this.dependencies = dependencies.slice(0); // clone the array
    this.folderPath = folderPath;
    this.parent = undefined;
    this.children = [];
    this._childrenByName = new Map<string, Package>();
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

  public getChildByName(childPackageName: string): Package {
    return this._childrenByName.get(childPackageName);
  }

  /**
   * Searches the node_modules hierarchy for the nearest matching package with the
   * given name.  Note that the nearest match may have an incompatible version.
   * If a match is found, then the "found" result will not be undefined.
   * In either case, the parentForCreate result indicates where the missing
   * dependency can be added, i.e. if the requested dependency was not found
   * or was found with an incompatible version.
   */
  public resolveOrCreate(dependencyName: string): IResolveOrCreateResult {

    let currentParent: Package = this;
    let parentForCreate: Package = this;

    for (; ; ) {
      // NOTE: Initially we don't compare against ourself, because self-references
      // are a special case

      // Does any child match?
      for (const child of currentParent.children) {
        if (child.name === dependencyName) {
          // One of the children matched.
          // parentForCreate will be the parent
          return { found: child, parentForCreate };
        }
      }

      // Go up to the next parent
      parentForCreate = currentParent;
      currentParent = currentParent.parent;

      if (!currentParent) {
        // We reached the root without finding a match
        // parentForCreate will be the root.
        return { found: undefined, parentForCreate };
      }

      if (currentParent.name === dependencyName) {
        // One of the parents was the match.
        // parentForCreate will be the parent we checked before
        return { found: currentParent, parentForCreate };
      }
    }
  }

  /**
   * Searches the node_modules hierarchy for the nearest matching package with the
   * given name.  If no match is found, then undefined is returned.
   */
  public resolve(dependencyName: string): Package {
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
}

export interface IResolveOrCreateResult {
  found: Package;
  parentForCreate: Package;
}
