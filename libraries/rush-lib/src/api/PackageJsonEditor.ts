// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as semver from 'semver';

import { InternalError, type IPackageJson, JsonFile, Sort, JsonSyntax } from '@rushstack/node-core-library';

import { cloneDeep } from '../utilities/objectUtilities.ts';

/**
 * @public
 */
export enum DependencyType {
  Regular = 'dependencies',
  Dev = 'devDependencies',
  Optional = 'optionalDependencies',
  Peer = 'peerDependencies',
  YarnResolutions = 'resolutions'
}

/**
 * @public
 */
export class PackageJsonDependency {
  private _version: string;
  private _onChange: () => void;

  public readonly name: string;
  public readonly dependencyType: DependencyType;

  public constructor(name: string, version: string, type: DependencyType, onChange: () => void) {
    this.name = name;
    this._version = version;
    this.dependencyType = type;
    this._onChange = onChange;
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
}

/**
 * @public
 */
export class PackageJsonDependencyMeta {
  private _injected: boolean;
  private _onChange: () => void;

  public readonly name: string;

  public constructor(name: string, injected: boolean, onChange: () => void) {
    this.name = name;
    this._injected = injected;
    this._onChange = onChange;
  }

  public get injected(): boolean {
    return this._injected;
  }
}

/**
 * @public
 */
export class PackageJsonEditor {
  private readonly _dependencies: Map<string, PackageJsonDependency>;
  // NOTE: The "devDependencies" section is tracked separately because sometimes people
  // will specify a specific version for development, while *also* specifying a broader
  // SemVer range in one of the other fields for consumers.  Thus "dependencies", "optionalDependencies",
  // and "peerDependencies" are mutually exclusive, but "devDependencies" is not.
  private readonly _devDependencies: Map<string, PackageJsonDependency>;

  private readonly _dependenciesMeta: Map<string, PackageJsonDependencyMeta>;

  // NOTE: The "resolutions" field is a yarn specific feature that controls package
  // resolution override within yarn.
  private readonly _resolutions: Map<string, PackageJsonDependency>;
  private _modified: boolean;
  private _sourceData: IPackageJson;

  public readonly filePath: string;

  /**
   * @internal
   */
  protected constructor(filepath: string, data: IPackageJson) {
    this.filePath = filepath;
    this._sourceData = data;
    this._modified = false;

    this._dependencies = new Map<string, PackageJsonDependency>();
    this._devDependencies = new Map<string, PackageJsonDependency>();
    this._resolutions = new Map<string, PackageJsonDependency>();
    this._dependenciesMeta = new Map<string, PackageJsonDependencyMeta>();

    const dependencies: { [key: string]: string } = data.dependencies || {};
    const optionalDependencies: { [key: string]: string } = data.optionalDependencies || {};
    const peerDependencies: { [key: string]: string } = data.peerDependencies || {};

    const devDependencies: { [key: string]: string } = data.devDependencies || {};
    const resolutions: { [key: string]: string } = data.resolutions || {};

    const dependenciesMeta: { [key: string]: { [key: string]: boolean } } = data.dependenciesMeta || {};

    const _onChange: () => void = this._onChange.bind(this);

    try {
      Object.keys(dependencies || {}).forEach((packageName: string) => {
        if (Object.prototype.hasOwnProperty.call(optionalDependencies, packageName)) {
          throw new Error(
            `The package "${packageName}" cannot be listed in both ` +
              `"dependencies" and "optionalDependencies"`
          );
        }
        if (Object.prototype.hasOwnProperty.call(peerDependencies, packageName)) {
          throw new Error(
            `The package "${packageName}" cannot be listed in both "dependencies" and "peerDependencies"`
          );
        }

        this._dependencies.set(
          packageName,
          new PackageJsonDependency(packageName, dependencies[packageName], DependencyType.Regular, _onChange)
        );
      });

      Object.keys(optionalDependencies || {}).forEach((packageName: string) => {
        if (Object.prototype.hasOwnProperty.call(peerDependencies, packageName)) {
          throw new Error(
            `The package "${packageName}" cannot be listed in both ` +
              `"optionalDependencies" and "peerDependencies"`
          );
        }
        this._dependencies.set(
          packageName,
          new PackageJsonDependency(
            packageName,
            optionalDependencies[packageName],
            DependencyType.Optional,
            _onChange
          )
        );
      });

      Object.keys(peerDependencies || {}).forEach((packageName: string) => {
        this._dependencies.set(
          packageName,
          new PackageJsonDependency(
            packageName,
            peerDependencies[packageName],
            DependencyType.Peer,
            _onChange
          )
        );
      });

      Object.keys(devDependencies || {}).forEach((packageName: string) => {
        this._devDependencies.set(
          packageName,
          new PackageJsonDependency(packageName, devDependencies[packageName], DependencyType.Dev, _onChange)
        );
      });

      Object.keys(resolutions || {}).forEach((packageName: string) => {
        this._resolutions.set(
          packageName,
          new PackageJsonDependency(
            packageName,
            resolutions[packageName],
            DependencyType.YarnResolutions,
            _onChange
          )
        );
      });

      Object.keys(dependenciesMeta || {}).forEach((packageName: string) => {
        this._dependenciesMeta.set(
          packageName,
          new PackageJsonDependencyMeta(packageName, dependenciesMeta[packageName].injected, _onChange)
        );
      });

      // (Do not sort this._resolutions because order may be significant; the RFC is unclear about that.)
      Sort.sortMapKeys(this._dependencies);
      Sort.sortMapKeys(this._devDependencies);
    } catch (e) {
      throw new Error(`Error loading "${filepath}": ${(e as Error).message}`);
    }
  }

  public static load(filePath: string): PackageJsonEditor {
    return new PackageJsonEditor(filePath, JsonFile.load(filePath));
  }

  public static fromObject(object: IPackageJson, filename: string): PackageJsonEditor {
    return new PackageJsonEditor(filename, object);
  }

  public get name(): string {
    return this._sourceData.name;
  }

  public get version(): string {
    return this._sourceData.version;
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

  /**
   * The list of dependenciesMeta in package.json.
   */
  public get dependencyMetaList(): ReadonlyArray<PackageJsonDependencyMeta> {
    return [...this._dependenciesMeta.values()];
  }

  /**
   * This field is a Yarn-specific feature that allows overriding of package resolution.
   *
   * @remarks
   * See the {@link https://github.com/yarnpkg/rfcs/blob/master/implemented/0000-selective-versions-resolutions.md
   * | 0000-selective-versions-resolutions.md RFC} for details.
   */
  public get resolutionsList(): ReadonlyArray<PackageJsonDependency> {
    return [...this._resolutions.values()];
  }

  public tryGetDependency(packageName: string): PackageJsonDependency | undefined {
    return this._dependencies.get(packageName);
  }

  public tryGetDevDependency(packageName: string): PackageJsonDependency | undefined {
    return this._devDependencies.get(packageName);
  }

  public addOrUpdateDependency(
    packageName: string,
    newVersion: string,
    dependencyType: DependencyType
  ): void {
    const dependency: PackageJsonDependency = new PackageJsonDependency(
      packageName,
      newVersion,
      dependencyType,
      this._onChange.bind(this)
    );

    // Rush collapses everything that isn't a devDependency into the dependencies
    // field, so we need to set the value depending on dependency type
    switch (dependencyType) {
      case DependencyType.Regular:
      case DependencyType.Optional:
      case DependencyType.Peer:
        this._dependencies.set(packageName, dependency);
        break;
      case DependencyType.Dev:
        this._devDependencies.set(packageName, dependency);
        break;
      case DependencyType.YarnResolutions:
        this._resolutions.set(packageName, dependency);
        break;
      default:
        throw new InternalError('Unsupported DependencyType');
    }

    this._modified = true;
  }

  public removeDependency(packageName: string, dependencyType: DependencyType): void {
    switch (dependencyType) {
      case DependencyType.Regular:
      case DependencyType.Optional:
      case DependencyType.Peer:
        this._dependencies.delete(packageName);
        break;
      case DependencyType.Dev:
        this._devDependencies.delete(packageName);
        break;
      case DependencyType.YarnResolutions:
        this._resolutions.delete(packageName);
        break;
      default:
        throw new InternalError('Unsupported DependencyType');
    }

    this._modified = true;
  }

  public saveIfModified(): boolean {
    if (this._modified) {
      this._modified = false;
      this._sourceData = this._normalize(this._sourceData);
      JsonFile.save(this._sourceData, this.filePath, {
        updateExistingFile: true,
        jsonSyntax: JsonSyntax.Strict
      });
      return true;
    }
    return false;
  }

  /**
   * Get the normalized package.json that represents the current state of the
   * PackageJsonEditor. This method does not save any changes that were made to the
   * package.json, but instead returns the object representation of what would be saved
   * if saveIfModified() is called.
   */
  public saveToObject(): IPackageJson {
    // Only normalize if we need to
    const sourceData: IPackageJson = this._modified ? this._normalize(this._sourceData) : this._sourceData;
    // Provide a clone to avoid reference back to the original data object
    return cloneDeep(sourceData);
  }

  private _onChange(): void {
    this._modified = true;
  }

  /**
   * Create a normalized shallow copy of the provided package.json without modifying the
   * original. If the result of this method is being returned via a public facing method,
   * it will still need to be deep-cloned to avoid propogating changes back to the
   * original dataset.
   */
  private _normalize(source: IPackageJson): IPackageJson {
    const normalizedData: IPackageJson = { ...source };
    delete normalizedData.dependencies;
    delete normalizedData.optionalDependencies;
    delete normalizedData.peerDependencies;
    delete normalizedData.devDependencies;
    delete normalizedData.resolutions;

    const keys: string[] = [...this._dependencies.keys()].sort();

    for (const packageName of keys) {
      const dependency: PackageJsonDependency = this._dependencies.get(packageName)!;

      switch (dependency.dependencyType) {
        case DependencyType.Regular:
          if (!normalizedData.dependencies) {
            normalizedData.dependencies = {};
          }
          normalizedData.dependencies[dependency.name] = dependency.version;
          break;
        case DependencyType.Optional:
          if (!normalizedData.optionalDependencies) {
            normalizedData.optionalDependencies = {};
          }
          normalizedData.optionalDependencies[dependency.name] = dependency.version;
          break;
        case DependencyType.Peer:
          if (!normalizedData.peerDependencies) {
            normalizedData.peerDependencies = {};
          }
          normalizedData.peerDependencies[dependency.name] = dependency.version;
          break;
        case DependencyType.Dev: // uses this._devDependencies instead
        case DependencyType.YarnResolutions: // uses this._resolutions instead
        default:
          throw new InternalError('Unsupported DependencyType');
      }
    }

    const devDependenciesKeys: string[] = [...this._devDependencies.keys()].sort();

    for (const packageName of devDependenciesKeys) {
      const dependency: PackageJsonDependency = this._devDependencies.get(packageName)!;

      if (!normalizedData.devDependencies) {
        normalizedData.devDependencies = {};
      }
      normalizedData.devDependencies[dependency.name] = dependency.version;
    }

    // (Do not sort this._resolutions because order may be significant; the RFC is unclear about that.)
    for (const packageName of this._resolutions.keys()) {
      const dependency: PackageJsonDependency = this._resolutions.get(packageName)!;

      if (!normalizedData.resolutions) {
        normalizedData.resolutions = {};
      }
      normalizedData.resolutions[dependency.name] = dependency.version;
    }

    return normalizedData;
  }
}
