// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  JsonFile,
  IPackageJsonWithVersion
} from '@microsoft/node-core-library';

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
export interface IRushTempPackageJson extends IPackageJsonWithVersion {
  /**
   * An extra setting written into package.json for temp packages, to track
   * references to locally built projects.
   */
  rushDependencies?: { [key: string]: string };
}

/**
 * Represents an NPM package being processed by the "rush link" algorithm.
 */
export class BasePackage {
  /**
   * The "name" field from package.json
   */
  public name: string;

  /**
   * The "version" field from package.json. This is expensive to read
   * because we have to open the package.json file.  Only when DEBUG=true
   */
  public version: string | undefined;

  /**
   * The absolute path to the folder that contains package.json.
   */
  public folderPath: string;

  /**
   * The parent package, or undefined if this is the root of the tree.
   */
  public parent: BasePackage | undefined;

  /**
   * The raw package.json information for this Package
   */
  public packageJson: IRushTempPackageJson | undefined;

  /**
   * If this is a local path that we are planning to symlink to a target folder,
   * then symlinkTargetFolderPath keeps track of the intended target.
   */
  public symlinkTargetFolderPath: string | undefined = undefined;

  /**
   * Packages that were placed in node_modules subfolders of this package.
   * The child packages are not necessarily dependencies of this package.
   */
  public children: BasePackage[];
  private _childrenByName: Map<string, BasePackage>;

  /**
   * Used by link managers, creates a virtual Package object that represents symbolic links
   * which will be created later
   */
  public static createLinkedPackage(name: string,
    version: string | undefined,
    folderPath: string,
    packageJson?: IRushTempPackageJson): BasePackage {
    return new BasePackage(name, version, folderPath, packageJson);
  }

  /**
   * Used by "npm link" to simulate a temp project that is missing from the common/node_modules
   * folder (e.g. because it was added after the shrinkwrap file was regenerated).
   * @param packageJsonFilename - Filename of the source package.json
   *        Example: `C:\MyRepo\common\temp\projects\project1\package.json`
   * @param targetFolderName - Filename where it should have been installed
   *        Example: `C:\MyRepo\common\temp\node_modules\@rush-temp\project1`
   */
  public static createVirtualTempPackage(packageJsonFilename: string, installFolderName: string): BasePackage {
    const packageJson: IRushTempPackageJson = JsonFile.load(packageJsonFilename);
    return BasePackage.createLinkedPackage(packageJson.name, packageJson.version, installFolderName, packageJson);
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

  public addChild<T extends BasePackage>(child: T): void {
    if (child.parent) {
      throw new Error('Child already has a parent');
    }
    if (this._childrenByName.has(child.name)) {
      throw new Error('Child already exists');
    }
    child.parent = this;
    this.children.push(child);
    this._childrenByName.set(child.name, child);
  }

  public getChildByName(childPackageName: string): BasePackage | undefined {
    return this._childrenByName.get(childPackageName);
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

  protected constructor(name: string,
    version: string | undefined,
    folderPath: string,
    packageJson: IRushTempPackageJson | undefined) {

    this.name = name;
    this.packageJson = packageJson;
    this.version = version;
    this.folderPath = folderPath;

    this.children = [];
    this._childrenByName = new Map<string, BasePackage>();
  }
}