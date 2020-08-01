// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

console.log('CommonVersionsConfiguration.ts  : 1: ' + (new Date().getTime() % 20000) / 1000.0);
import * as crypto from 'crypto';
console.log('CommonVersionsConfiguration.ts  : 2: ' + (new Date().getTime() % 20000) / 1000.0);
import * as path from 'path';
console.log('CommonVersionsConfiguration.ts  : 3: ' + (new Date().getTime() % 20000) / 1000.0);
import {
  JsonFile,
  JsonSchema,
  MapExtensions,
  ProtectableMap,
  FileSystem,
  Sort
} from '@rushstack/node-core-library';
console.log('CommonVersionsConfiguration.ts  : 4: ' + (new Date().getTime() % 20000) / 1000.0);
import { PackageNameParsers } from './PackageNameParsers';
console.log('CommonVersionsConfiguration.ts  : 5: ' + (new Date().getTime() % 20000) / 1000.0);
import { JsonSchemaUrls } from '../logic/JsonSchemaUrls';
console.log('CommonVersionsConfiguration.ts  : 6: ' + (new Date().getTime() % 20000) / 1000.0);

/**
 * Part of the ICommonVersionsJson structure.
 */
export declare interface ICommonVersionsJsonVersionMap {
  /**
   * The key is the name of a dependency.  The value is a Semantic Versioning (SemVer)
   * range specifier.
   */
  [dependencyName: string]: string;
}

/**
 * Part of the ICommonVersionsJson structure.
 */
export declare interface ICommonVersionsJsonVersionsMap {
  /**
   * The key is the name of a dependency.  The value is a list of Semantic Versioning (SemVer)
   * range specifiers.
   */
  [dependencyName: string]: string[];
}

/**
 * Describes the file structure for the "common/config/rush/common-versions.json" config file.
 */
interface ICommonVersionsJson {
  $schema?: string;

  preferredVersions?: ICommonVersionsJsonVersionMap;

  implicitlyPreferredVersions?: boolean;

  xstitchPreferredVersions?: ICommonVersionsJsonVersionMap;

  allowedAlternativeVersions?: ICommonVersionsJsonVersionsMap;
}

/**
 * Use this class to load and save the "common/config/rush/common-versions.json" config file.
 * This config file stores dependency version information that affects all projects in the repo.
 * @public
 */
export class CommonVersionsConfiguration {
  private static get _jsonSchema(): JsonSchema {
    return JsonSchema.fromFile(path.join(__dirname, '../schemas/common-versions.schema.json'));
  }

  private _filePath: string;
  private _preferredVersions: ProtectableMap<string, string>;
  private _implicitlyPreferredVersions: boolean | undefined;
  private _xstitchPreferredVersions: ProtectableMap<string, string>;
  private _allowedAlternativeVersions: ProtectableMap<string, string[]>;
  private _modified: boolean;

  private constructor(commonVersionsJson: ICommonVersionsJson | undefined, filePath: string) {
    this._preferredVersions = new ProtectableMap<string, string>({
      onSet: this._onSetPreferredVersions.bind(this)
    });

    if (commonVersionsJson && commonVersionsJson.implicitlyPreferredVersions !== undefined) {
      this._implicitlyPreferredVersions = commonVersionsJson.implicitlyPreferredVersions;
    } else {
      this._implicitlyPreferredVersions = undefined;
    }

    this._xstitchPreferredVersions = new ProtectableMap<string, string>({
      onSet: this._onSetPreferredVersions.bind(this)
    });

    this._allowedAlternativeVersions = new ProtectableMap<string, string[]>({
      onSet: this._onSetAllowedAlternativeVersions.bind(this)
    });

    if (commonVersionsJson) {
      try {
        CommonVersionsConfiguration._deserializeTable(
          this.preferredVersions,
          commonVersionsJson.preferredVersions
        );
        CommonVersionsConfiguration._deserializeTable(
          this.xstitchPreferredVersions,
          commonVersionsJson.xstitchPreferredVersions
        );
        CommonVersionsConfiguration._deserializeTable(
          this.allowedAlternativeVersions,
          commonVersionsJson.allowedAlternativeVersions
        );
      } catch (e) {
        throw new Error(`Error loading "${path.basename(filePath)}": ${e.message}`);
      }
    }
    this._filePath = filePath;
  }

  /**
   * Loads the common-versions.json data from the specified file path.
   * If the file has not been created yet, then an empty object is returned.
   */
  public static loadFromFile(jsonFilename: string): CommonVersionsConfiguration {
    let commonVersionsJson: ICommonVersionsJson | undefined = undefined;

    if (FileSystem.exists(jsonFilename)) {
      commonVersionsJson = JsonFile.loadAndValidate(jsonFilename, CommonVersionsConfiguration._jsonSchema);
    }

    return new CommonVersionsConfiguration(commonVersionsJson, jsonFilename);
  }

  private static _deserializeTable<TValue>(map: Map<string, TValue>, object: {} | undefined): void {
    if (object) {
      for (const key of Object.getOwnPropertyNames(object)) {
        const value: TValue = object[key];
        map.set(key, value);
      }
    }
  }

  private static _serializeTable<TValue>(map: Map<string, TValue>): {} {
    const table: {} = {};

    const keys: string[] = [...map.keys()];
    keys.sort();
    for (const key of keys) {
      table[key] = map.get(key);
    }

    return table;
  }

  /**
   * Get the absolute file path of the common-versions.json file.
   */
  public get filePath(): string {
    return this._filePath;
  }

  /**
   * Get a sha1 hash of the preferred versions.
   */
  public getPreferredVersionsHash(): string {
    // Sort so that the hash is stable
    const orderedPreferredVersions: Map<string, string> = new Map<string, string>(
      this._preferredVersions.protectedView
    );
    Sort.sortMapKeys(orderedPreferredVersions);

    // JSON.stringify does not support maps, so we need to convert to an object first
    const preferredVersionsObj: { [dependency: string]: string } = MapExtensions.toObject(
      orderedPreferredVersions
    );
    return crypto.createHash('sha1').update(JSON.stringify(preferredVersionsObj)).digest('hex');
  }

  /**
   * Writes the "common-versions.json" file to disk, using the filename that was passed to loadFromFile().
   */
  public save(): boolean {
    if (this._modified) {
      JsonFile.save(this._serialize(), this._filePath, { updateExistingFile: true });
      this._modified = false;
      return true;
    }

    return false;
  }

  /**
   * A table that specifies a "preferred version" for a given NPM package.  This feature is typically used
   * to hold back an indirect dependency to a specific older version, or to reduce duplication of indirect dependencies.
   *
   * @remarks
   * The "preferredVersions" value can be any SemVer range specifier (e.g. `~1.2.3`).  Rush injects these values into
   * the "dependencies" field of the top-level common/temp/package.json, which influences how the package manager
   * will calculate versions.  The specific effect depends on your package manager.  Generally it will have no
   * effect on an incompatible or already constrained SemVer range.  If you are using PNPM, similar effects can be
   * achieved using the pnpmfile.js hook.  See the Rush documentation for more details.
   *
   * After modifying this field, it's recommended to run `rush update --full` so that the package manager
   * will recalculate all version selections.
   */
  public get preferredVersions(): Map<string, string> {
    return this._preferredVersions.protectedView;
  }

  /**
   * When set to true, for all projects in the repo, all dependencies will be automatically added as preferredVersions,
   * except in cases where different projects specify different version ranges for a given dependency.  For older
   * package managers, this tended to reduce duplication of indirect dependencies.  However, it can sometimes cause
   * trouble for indirect dependencies with incompatible peerDependencies ranges.
   *
   * If the value is `undefined`, then the default value is `true`.
   */
  public get implicitlyPreferredVersions(): boolean | undefined {
    return this._implicitlyPreferredVersions;
  }

  /**
   * A table of specifies preferred versions maintained by the XStitch tool.
   *
   * @remarks
   * This property has the same behavior as the "preferredVersions" property, except these entries
   * are automatically managed by the XStitch tool.  It is an error for the same dependency name
   * to appear in both tables.
   */
  public get xstitchPreferredVersions(): Map<string, string> {
    return this._xstitchPreferredVersions.protectedView;
  }

  /**
   * A table that stores, for a given dependency, a list of SemVer ranges that will be accepted
   * by "rush check" in addition to the normal version range.
   *
   * @remarks
   * The "rush check" command can be used to enforce that every project in the repo
   * must specify the same SemVer range for a given dependency.  However, sometimes
   * exceptions are needed.  The allowedAlternativeVersions table allows you to list
   * other SemVer ranges that will be accepted by "rush check" for a given dependency.
   * Note that the normal version range (as inferred by looking at all projects in the repo)
   * should NOT be included in this list.
   */
  public get allowedAlternativeVersions(): Map<string, ReadonlyArray<string>> {
    return this._allowedAlternativeVersions.protectedView;
  }

  /**
   * Returns the union of preferredVersions and xstitchPreferredVersions.
   */
  public getAllPreferredVersions(): Map<string, string> {
    const allPreferredVersions: Map<string, string> = new Map<string, string>();
    MapExtensions.mergeFromMap(allPreferredVersions, this.preferredVersions);
    MapExtensions.mergeFromMap(allPreferredVersions, this.xstitchPreferredVersions);
    return allPreferredVersions;
  }

  private _onSetPreferredVersions(
    source: ProtectableMap<string, string>,
    key: string,
    value: string
  ): string {
    PackageNameParsers.permissive.validate(key);

    if (source === this._preferredVersions) {
      if (this._xstitchPreferredVersions.has(key)) {
        throw new Error(
          `The package "${key}" cannot be added to preferredVersions because it was already` +
            ` added to xstitchPreferredVersions`
        );
      }
    } else {
      if (this._preferredVersions.has(key)) {
        throw new Error(
          `The package "${key}" cannot be added to xstitchPreferredVersions because it was already` +
            ` added to preferredVersions`
        );
      }
    }

    this._modified = true;

    return value;
  }

  private _onSetAllowedAlternativeVersions(
    source: ProtectableMap<string, string>,
    key: string,
    value: string
  ): string {
    PackageNameParsers.permissive.validate(key);

    this._modified = true;

    return value;
  }

  private _serialize(): ICommonVersionsJson {
    const result: ICommonVersionsJson = {
      $schema: JsonSchemaUrls.commonVersions
    };

    if (this._preferredVersions.size) {
      result.preferredVersions = CommonVersionsConfiguration._serializeTable(this.preferredVersions);
    }

    if (this._xstitchPreferredVersions.size) {
      result.xstitchPreferredVersions = CommonVersionsConfiguration._serializeTable(
        this.xstitchPreferredVersions
      );
    }

    if (this._allowedAlternativeVersions.size) {
      result.allowedAlternativeVersions = CommonVersionsConfiguration._serializeTable(
        this.allowedAlternativeVersions
      );
    }

    return result;
  }
}
