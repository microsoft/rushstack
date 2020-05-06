// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as semver from 'semver';

import {
  IPackageJson,
  JsonFile,
  Sort
} from '@rushstack/node-core-library';

/**
 * @beta
 */
export const enum DependencyType {
  Regular = 'dependencies',
  Dev = 'devDependencies',
  Optional = 'optionalDependencies',
  Peer = 'peerDependencies'
}

/**
 * @beta
 */
export class PackageJsonDependency {
  private _type: DependencyType;
  private _name: string;
  private _version: string;
  private _onChange: () => void;

  public constructor(name: string,
    version: string,
    type: DependencyType,
    onChange: () => void) {
    this._name = name;
    this._version = version;
    this._type = type;
    this._onChange = onChange;
  }

  public get name(): string {
    return this._name;
  }

  public get version(): string {
    return this._version;
  }

  public setVersion(newVersion: string): void {
    if (!semver.valid(newVersion) && !semver.validRange(newVersion)) {
      throw new Error(`Cannot set version to invalid value: "${newVersion}"`);
    }
    this._version = newVersion;
    this._onChange();
  }

  public get dependencyType(): DependencyType {
    return this._type;
  }
}

/**
 * @beta
 */
export class PackageJsonEditor {
  private readonly _filePath: string;
  private readonly _data: IPackageJson;
  private readonly _dependencies: Map<string, PackageJsonDependency>;

  // NOTE: The "devDependencies" section is tracked separately because sometimes people
  // will specify a specific version for development, while *also* specifying a broader
  // SemVer range in one of the other fields for consumers.  Thus "dependencies", "optionalDependencies",
  // and "peerDependencies" are mutually exclusive, but "devDependencies" is not.
  private readonly _devDependencies: Map<string, PackageJsonDependency>;
  private _modified: boolean;

  private constructor(filepath: string, data: IPackageJson) {
    this._filePath = filepath;
    this._data = data;
    this._modified = false;

    this._dependencies = new Map<string, PackageJsonDependency>();
    this._devDependencies = new Map<string, PackageJsonDependency>();

    const dependencies: { [key: string]: string } = data.dependencies || {};
    const optionalDependencies: { [key: string]: string } = data.optionalDependencies || {};
    const peerDependencies: { [key: string]: string } = data.peerDependencies || {};

    const devDependencies: { [key: string]: string } = data.devDependencies || {};

    const _onChange: () => void = this._onChange.bind(this);

    try {
      Object.keys(dependencies || {}).forEach((packageName: string) => {
        if (Object.prototype.hasOwnProperty.call(optionalDependencies, packageName)) {
          throw new Error(`The package "${packageName}" cannot be listed in both `
            + `"dependencies" and "optionalDependencies"`);
        }
        if (Object.prototype.hasOwnProperty.call(peerDependencies, packageName)) {
          throw new Error(`The package "${packageName}" cannot be listed in both `
            + `"dependencies" and "peerDependencies"`);
        }

        this._dependencies.set(packageName,
          new PackageJsonDependency(packageName, dependencies[packageName], DependencyType.Regular, _onChange));
      });

      Object.keys(optionalDependencies || {}).forEach((packageName: string) => {
        if (Object.prototype.hasOwnProperty.call(peerDependencies, packageName)) {
          throw new Error(`The package "${packageName}" cannot be listed in both `
            + `"optionalDependencies" and "peerDependencies"`);
        }
        this._dependencies.set(packageName,
          new PackageJsonDependency(packageName, optionalDependencies[packageName], DependencyType.Optional, _onChange)
        );
      });

      Object.keys(peerDependencies || {}).forEach((packageName: string) => {
        this._dependencies.set(packageName,
          new PackageJsonDependency(packageName, peerDependencies[packageName], DependencyType.Peer, _onChange));
      });

      Object.keys(devDependencies || {}).forEach((packageName: string) => {
        this._devDependencies.set(packageName,
          new PackageJsonDependency(packageName, devDependencies[packageName], DependencyType.Dev, _onChange));
      });

      Sort.sortMapKeys(this._dependencies);
      Sort.sortMapKeys(this._devDependencies);

    } catch (e) {
      throw new Error(`Error loading "${filepath}": ${e.message}`);
    }
  }

  public static load(filePath: string): PackageJsonEditor {
    return new PackageJsonEditor(filePath, JsonFile.load(filePath));
  }

  public static fromObject(object: IPackageJson, filename: string): PackageJsonEditor {
    return new PackageJsonEditor(filename, object);
  }

  public get name(): string {
    return this._data.name;
  }

  public get version(): string {
    return this._data.version;
  }

  public get filePath(): string {
    return this._filePath;
  }

  /**
   * The list of dependencies of type DependencyType.Regular, DependencyType.Optional, or DependencyType.Peer.
   */
  public get dependencyList(): ReadonlyArray<PackageJsonDependency> {
    return [...this._dependencies.values()];
  }

  /**
   * The list of dependencies of type DependencyType.Dev.
   */
  public get devDependencyList(): ReadonlyArray<PackageJsonDependency> {
    return [...this._devDependencies.values()];
  }

  public tryGetDependency(packageName: string): PackageJsonDependency | undefined {
    return this._dependencies.get(packageName);
  }

  public tryGetDevDependency(packageName: string): PackageJsonDependency | undefined {
    return this._devDependencies.get(packageName);
  }

  public addOrUpdateDependency(packageName: string, newVersion: string, dependencyType: DependencyType): void {
    const dependency: PackageJsonDependency = new PackageJsonDependency(
      packageName,
      newVersion,
      dependencyType,
      this._onChange.bind(this)
    );

    if (
      dependencyType === DependencyType.Regular ||
      dependencyType === DependencyType.Optional ||
      dependencyType === DependencyType.Peer
    ) {
      this._dependencies.set(packageName, dependency);
    } else {
      this._devDependencies.set(packageName, dependency);
    }
    this._modified = true;
  }

  public saveIfModified(): boolean {
    if (this._modified) {
      JsonFile.save(this._normalize(), this._filePath, { updateExistingFile: true });
      this._modified = false;
      return true;
    }
    return false;
  }

  private _onChange(): void {
    this._modified = true;
  }

  private _normalize(): IPackageJson {
    delete this._data.dependencies;
    delete this._data.optionalDependencies;
    delete this._data.peerDependencies;
    delete this._data.devDependencies;

    const keys: string[] = [...this._dependencies.keys()].sort();

    for (const packageName of keys) {
      const dependency: PackageJsonDependency = this._dependencies.get(packageName)!;

      if (dependency.dependencyType === DependencyType.Regular) {
        if (!this._data.dependencies) {
          this._data.dependencies = {};
        }
        this._data.dependencies[dependency.name] = dependency.version;
      }

      if (dependency.dependencyType === DependencyType.Optional) {
        if (!this._data.optionalDependencies) {
          this._data.optionalDependencies = {};
        }
        this._data.optionalDependencies[dependency.name] = dependency.version;
      }

      if (dependency.dependencyType === DependencyType.Peer) {
        if (!this._data.peerDependencies) {
          this._data.peerDependencies = {};
        }
        this._data.peerDependencies[dependency.name] = dependency.version;
      }
    }

    const devDependenciesKeys: string[] = [...this._devDependencies.keys()].sort();

    for (const packageName of devDependenciesKeys) {
      const dependency: PackageJsonDependency = this._devDependencies.get(packageName)!;

      if (!this._data.devDependencies) {
        this._data.devDependencies = {};
      }
      this._data.devDependencies[dependency.name] = dependency.version;
    }

    return this._data;
  }
}
