// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as semver from 'semver';

import { InternalError, type IPackageJson, JsonFile, Sort, JsonSyntax } from '@rushstack/node-core-library';

import { cloneDeep } from '../utilities/objectUtilities';

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

    const {
      dependencies = {},
      optionalDependencies = {},
      peerDependencies = {},
      devDependencies = {},
      resolutions = {},
      dependenciesMeta = {}
    } = data;

    const _onChange: () => void = this._onChange.bind(this);

    const optionalDependenciesSet: Set<string> = new Set(Object.keys(optionalDependencies));
    const peerDependenciesSet: Set<string> = new Set(Object.keys(peerDependencies));
    try {
      const dependenciesMapEntries: [string, PackageJsonDependency][] = Object.entries(dependencies).map(
        ([packageName, version]: [string, string]) => {
          if (optionalDependenciesSet.has(packageName)) {
            throw new Error(
              `The package "${packageName}" cannot be listed in both ` +
                `"dependencies" and "optionalDependencies"`
            );
          }
          if (peerDependenciesSet.has(packageName)) {
            throw new Error(
              `The package "${packageName}" cannot be listed in both "dependencies" and "peerDependencies"`
            );
          }

          return [
            packageName,
            new PackageJsonDependency(packageName, version, DependencyType.Regular, _onChange)
          ];
        }
      );

      const optionalDependenciesMapEntries: [string, PackageJsonDependency][] = Object.entries(
        optionalDependencies
      ).map(([packageName, version]) => {
        if (peerDependenciesSet.has(packageName)) {
          throw new Error(
            `The package "${packageName}" cannot be listed in both ` +
              `"optionalDependencies" and "peerDependencies"`
          );
        }
        return [
          packageName,
          new PackageJsonDependency(packageName, version, DependencyType.Optional, _onChange)
        ];
      });

      const peerDependenciesMapEntries: [string, PackageJsonDependency][] = Object.entries(
        peerDependencies
      ).map(([packageName, version]) => [
        packageName,
        new PackageJsonDependency(packageName, version, DependencyType.Peer, _onChange)
      ]);

      this._dependencies = new Map([
        ...dependenciesMapEntries,
        ...optionalDependenciesMapEntries,
        ...peerDependenciesMapEntries
      ]);

      this._devDependencies = new Map(
        Object.entries(devDependencies).map(([packageName, version]) => [
          packageName,
          new PackageJsonDependency(packageName, version, DependencyType.Dev, _onChange)
        ])
      );

      this._resolutions = new Map(
        Object.entries(resolutions).map(([packageName, version]) => [
          packageName,
          new PackageJsonDependency(packageName, version, DependencyType.YarnResolutions, _onChange)
        ])
      );

      this._dependenciesMeta = new Map(
        Object.entries(dependenciesMeta).map(([packageName, { injected = false }]) => [
          packageName,
          new PackageJsonDependencyMeta(packageName, injected, _onChange)
        ])
      );

      // (Do not sort this._resolutions because order may be significant; the RFC is unclear about that.)
      Sort.sortMapKeys(this._dependencies);
      Sort.sortMapKeys(this._devDependencies);
    } catch (e) {
      throw new Error(`Error loading "${filepath}": ${(e as Error).message}`);
    }
  }

  /**
   * @deprecated Use {@link PackageJsonEditor.loadAsync} method instead.
   */
  public static load(filePath: string): PackageJsonEditor {
    const packageJson: IPackageJson = JsonFile.load(filePath);
    return new PackageJsonEditor(filePath, packageJson);
  }

  public static async loadAsync(filePath: string): Promise<PackageJsonEditor> {
    const packageJson: IPackageJson = await JsonFile.loadAsync(filePath);
    return new PackageJsonEditor(filePath, packageJson);
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
      case DependencyType.Peer: {
        this._dependencies.set(packageName, dependency);
        break;
      }

      case DependencyType.Dev: {
        this._devDependencies.set(packageName, dependency);
        break;
      }

      case DependencyType.YarnResolutions: {
        this._resolutions.set(packageName, dependency);
        break;
      }

      default: {
        throw new InternalError('Unsupported DependencyType');
      }
    }

    this._modified = true;
  }

  public removeDependency(packageName: string, dependencyType: DependencyType): void {
    switch (dependencyType) {
      case DependencyType.Regular:
      case DependencyType.Optional:
      case DependencyType.Peer: {
        this._dependencies.delete(packageName);
        break;
      }

      case DependencyType.Dev: {
        this._devDependencies.delete(packageName);
        break;
      }

      case DependencyType.YarnResolutions: {
        this._resolutions.delete(packageName);
        break;
      }

      default: {
        throw new InternalError('Unsupported DependencyType');
      }
    }

    this._modified = true;
  }

  /**
   * @deprecated Use {@link PackageJsonEditor.saveIfModifiedAsync} method instead.
   */
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

  public async saveIfModifiedAsync(): Promise<boolean> {
    if (this._modified) {
      this._modified = false;
      this._sourceData = this._normalize(this._sourceData);
      await JsonFile.saveAsync(this._sourceData, this.filePath, {
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
      const { dependencyType, name, version }: PackageJsonDependency = this._dependencies.get(packageName)!;

      switch (dependencyType) {
        case DependencyType.Regular: {
          if (!normalizedData.dependencies) {
            normalizedData.dependencies = {};
          }

          normalizedData.dependencies[name] = version;
          break;
        }

        case DependencyType.Optional: {
          if (!normalizedData.optionalDependencies) {
            normalizedData.optionalDependencies = {};
          }

          normalizedData.optionalDependencies[name] = version;
          break;
        }

        case DependencyType.Peer: {
          if (!normalizedData.peerDependencies) {
            normalizedData.peerDependencies = {};
          }

          normalizedData.peerDependencies[name] = version;
          break;
        }

        case DependencyType.Dev: // uses this._devDependencies instead
        case DependencyType.YarnResolutions: // uses this._resolutions instead
        default: {
          throw new InternalError('Unsupported DependencyType');
        }
      }
    }

    const devDependenciesKeys: string[] = [...this._devDependencies.keys()].sort();
    for (const packageName of devDependenciesKeys) {
      const { name, version }: PackageJsonDependency = this._devDependencies.get(packageName)!;

      if (!normalizedData.devDependencies) {
        normalizedData.devDependencies = {};
      }

      normalizedData.devDependencies[name] = version;
    }

    // (Do not sort this._resolutions because order may be significant; the RFC is unclear about that.)
    for (const packageName of this._resolutions.keys()) {
      const { name, version }: PackageJsonDependency = this._resolutions.get(packageName)!;

      if (!normalizedData.resolutions) {
        normalizedData.resolutions = {};
      }

      normalizedData.resolutions[name] = version;
    }

    return normalizedData;
  }
}
