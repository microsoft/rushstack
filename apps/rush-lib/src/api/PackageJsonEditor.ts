// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as semver from 'semver';

import {
  IPackageJson,
  JsonFile
} from '@microsoft/node-core-library';

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

  public setDependencyType(newType: DependencyType): void {
    this._type = newType;
    this._onChange();
  }
}

/**
 * @beta
 */
export class PackageJsonEditor {
  private readonly _filepath: string;
  private readonly _data: IPackageJson;
  private readonly _dependencies: Map<string, PackageJsonDependency>;
  private readonly _peerDependencies: Map<string, PackageJsonDependency>;

  private _onChange: () => void;
  private _modified: boolean;

  public static load(filepath: string): PackageJsonEditor {
    return new PackageJsonEditor(filepath, JsonFile.load(filepath));
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
    return this._filepath;
  }

  public getDependency(packageName: string): PackageJsonDependency | undefined {
    return this._dependencies.get(packageName);
  }

  public forEachDependency(cb: (dependency: PackageJsonDependency) => void): void {
    this._dependencies.forEach(cb);
  }

  public addOrUpdateDependency(packageName: string, newVersion: string, dependencyType: DependencyType): void {
    if (dependencyType === DependencyType.Peer) {
      throw new Error(`This function cannot be used to modify peer dependencies.`);
    }

    if (this._dependencies.has(packageName)) {
      const dependency: PackageJsonDependency = this._dependencies.get(packageName)!;
      dependency.setVersion(newVersion);
      dependency.setDependencyType(dependencyType);
    } else {
      const dependency: PackageJsonDependency
        = new PackageJsonDependency(packageName, newVersion, dependencyType, this._onChange);
      this._dependencies.set(packageName, dependency);
    }
  }

  public saveIfModified(): boolean {
    if (this._modified) {
      JsonFile.save(this._normalize(), this._filepath);
      this._modified = false;
      return true;
    }
    return false;
  }

  private constructor(filepath: string, data: IPackageJson) {
    this._filepath = filepath;
    this._data = data;

    this._dependencies = new Map<string, PackageJsonDependency>();
    this._peerDependencies = new Map<string, PackageJsonDependency>();

    const dependencies: { [key: string]: string } = data.dependencies || {};
    const devDependencies: { [key: string]: string } = data.devDependencies || {};
    const optionalDependencies: { [key: string]: string } = data.optionalDependencies || {};
    const peerDependencies: { [key: string]: string } = data.peerDependencies || {};

    this._onChange = () => {
      this._modified = true;
    };

    Object.keys(dependencies || {}).forEach((dependency: string) => {
      if (devDependencies[dependency]) {
        throw new Error(`The package "${dependency}" is listed as both a dev and a regular dependency`);
      }
      if (optionalDependencies[dependency]) {
        throw new Error(`The package "${dependency}" is listed as both a dev and a regular dependency`);
      }

      this._dependencies.set(dependency,
        new PackageJsonDependency(dependency, dependencies[dependency], DependencyType.Regular, this._onChange));
    });

    Object.keys(devDependencies || {}).forEach((dependency: string) => {
      if (optionalDependencies[dependency]) {
        throw new Error(`The package "${dependency}" is listed as both a dev and an optional dependency`);
      }

      this._dependencies.set(dependency,
        new PackageJsonDependency(dependency, devDependencies[dependency], DependencyType.Dev, this._onChange));
    });

    Object.keys(optionalDependencies || {}).forEach((dependency: string) => {
      this._dependencies.set(dependency, new PackageJsonDependency(dependency, optionalDependencies[dependency],
        DependencyType.Optional, this._onChange));
    });

    Object.keys(peerDependencies || {}).forEach((dependency: string) => {
      this._peerDependencies.set(dependency,
        new PackageJsonDependency(dependency, peerDependencies[dependency], DependencyType.Peer, this._onChange));
    });
  }

  private _normalize(): IPackageJson {
    delete this._data.dependencies;
    delete this._data.devDependencies;
    delete this._data.peerDependencies;
    delete this._data.optionalDependencies;

    const keys: Array<string> = [...this._dependencies.keys()].sort();

    for (const packageName of keys) {
      const dependency: PackageJsonDependency = this._dependencies.get(packageName)!;

      if (dependency.dependencyType === DependencyType.Regular) {
        if (!this._data.dependencies) {
          this._data.dependencies = {};
        }
        this._data.dependencies[dependency.name] = dependency.version;
      }

      if (dependency.dependencyType === DependencyType.Dev) {
        if (!this._data.devDependencies) {
          this._data.devDependencies = {};
        }
        this._data.devDependencies[dependency.name] = dependency.version;
      }

      if (dependency.dependencyType === DependencyType.Optional) {
        if (!this._data.optionalDependencies) {
          this._data.optionalDependencies = {};
        }
        this._data.optionalDependencies[dependency.name] = dependency.version;
      }
    }

    const peerKeys: Array<string> = [...this._peerDependencies.keys()].sort();

    for (const packageName of peerKeys) {
      const dependency: PackageJsonDependency = this._peerDependencies.get(packageName)!;
      if (!this._data.peerDependencies) {
        this._data.peerDependencies = {};
      }
      this._data.peerDependencies[dependency.name] = dependency.version;
    }

    return this._data;
  }
}