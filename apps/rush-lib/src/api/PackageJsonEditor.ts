import * as semver from 'semver';

import {
  IPackageJson,
  JsonFile
} from '@microsoft/node-core-library';

export const enum DependencyType {
  Dependency = 'dependency',
  DevDependency = 'devDependency',
  OptionalDependency = 'optionalDependency',
  PeerOnly = 'peerDependency'
}

export class Dependency {
  private _type: DependencyType;
  private _name: string;
  private _version: string | undefined;
  private _peerVersion: string | undefined;
  private _onChange: () => void;

  public constructor(name: string,
    version: string | undefined,
    type: DependencyType,
    peerVersion: string | undefined,
    onChange: () => void) {
    this._name = name;
    this._version = version;
    this._type = type;
    this._peerVersion = peerVersion;
    this._onChange = onChange;

    if (this._version && this._type === DependencyType.PeerOnly) {
      throw new Error(`Cannot specify a primary version if the dependency type is peer-only.`);
    }
    if (!this._peerVersion && this._type === DependencyType.PeerOnly) {
      throw new Error(`Must specify a peer version if the dependency type if peer-only.`);
    }
  }

  public get name(): string {
    return this._name;
  }

  public get version(): string | undefined {
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

  public get peerVersion(): string | undefined {
    return this._peerVersion;
  }
}

export class PackageJsonEditor {
  private readonly _filepath: string;
  private readonly _data: IPackageJson;
  private readonly _dependencies: Map<string, Dependency>;

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

  public getDependency(packageName: string): Dependency | undefined {
    return this._dependencies.get(packageName);
  }

  public forEachDependency(cb: (dependency: Dependency) => void): void {
    this._dependencies.forEach(cb);
  }

  public addOrUpdateDependency(packageName: string, newVersion: string, dependencyType: DependencyType): void {
    if (this._dependencies.has(packageName)) {
      const dependency: Dependency = this._dependencies.get(packageName)!;
      dependency.setVersion(newVersion);
      dependency.setDependencyType(dependencyType);
    } else {
      const dependency: Dependency
        = new Dependency(packageName, newVersion, dependencyType, undefined, this._onChange);
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

    this._dependencies = new Map<string, Dependency>();

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

      this._dependencies.set(dependency, new Dependency(dependency, dependencies[dependency],
        DependencyType.Dependency, peerDependencies[dependency], this._onChange));
    });

    Object.keys(devDependencies || {}).forEach((dependency: string) => {
      if (optionalDependencies[dependency]) {
        throw new Error(`The package "${dependency}" is listed as both a dev and an optional dependency`);
      }

      this._dependencies.set(dependency, new Dependency(dependency, devDependencies[dependency],
        DependencyType.Dependency, peerDependencies[dependency], this._onChange));
    });

    Object.keys(optionalDependencies || {}).forEach((dependency: string) => {
      this._dependencies.set(dependency, new Dependency(dependency, optionalDependencies[dependency],
        DependencyType.OptionalDependency, peerDependencies[dependency], this._onChange));
    });

    Object.keys(peerDependencies || {}).forEach((dependency: string) => {
      if (!this._dependencies.has(dependency)) {
        this._dependencies.set(dependency, new Dependency(dependency, undefined,
          DependencyType.PeerOnly, peerDependencies[dependency], this._onChange));
      }
    });
  }

  private _normalize(): IPackageJson {
    delete this._data.dependencies;
    delete this._data.devDependencies;
    delete this._data.peerDependencies;
    delete this._data.optionalDependencies;

    const keys: Array<string> = [...this._dependencies.keys()].sort();

    for (const packageName of keys) {
      const dependency: Dependency = this._dependencies.get(packageName)!;

      if (dependency.dependencyType === DependencyType.Dependency) {
        if (!this._data.dependencies) {
          this._data.dependencies = {};
        }
        this._data.dependencies[dependency.name] = dependency.version!;
      }

      if (dependency.dependencyType === DependencyType.DevDependency) {
        if (!this._data.devDependencies) {
          this._data.devDependencies = {};
        }
        this._data.devDependencies[dependency.name] = dependency.version!;
      }

      if (dependency.dependencyType === DependencyType.OptionalDependency) {
        if (!this._data.optionalDependencies) {
          this._data.optionalDependencies = {};
        }
        this._data.optionalDependencies[dependency.name] = dependency.version!;
      }

      if (dependency.peerVersion) {
        if (!this._data.peerDependencies) {
          this._data.peerDependencies = {};
        }
        this._data.peerDependencies[dependency.name] = dependency.peerVersion;
      }
    }

    return this._data;
  }
}