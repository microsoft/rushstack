// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import {
  JsonFile,
  JsonSchema,
  MapExtensions,
  PackageName,
  ProtectableMap,
  FileSystem
} from '@microsoft/node-core-library';
import { JsonSchemaUrls } from '../logic/JsonSchemaUrls';

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

  xstitchPreferredVersions?: ICommonVersionsJsonVersionMap;

  allowedAlternativeVersions?: ICommonVersionsJsonVersionsMap;
}

/**
 * Use this class to load and save the "common/config/rush/common-versions.json" config file.
 * This config file stores dependency version information that affects all projects in the repo.
 * @public
 */
export class CommonVersionsConfiguration {
  private static _jsonSchema: JsonSchema = JsonSchema.fromFile(
    path.join(__dirname, '../schemas/common-versions.schema.json'));

  private _filePath: string;
  private _preferredVersions: ProtectableMap<string, string>;
  private _xstitchPreferredVersions: ProtectableMap<string, string>;
  private _allowedAlternativeVersions: ProtectableMap<string, string[]>;
  private _modified: boolean;

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

  private static _serializeTable<TValue>(map: Map<string, TValue>): { } {
    const table: { } = { };

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
   * A table that specifies a "preferred version" for a dependency package.
   *
   * @remarks
   * The "preferred version" is typically used to hold an indirect dependency back to a specific
   * version, however generally it can be any SemVer range specifier (e.g. "~1.2.3"), and it
   * will narrow any (compatible) SemVer range specifier.
   *
   * For example, suppose local project `A` depends on an external package `B`, and `B` asks
   * for `C@^1.0.0`, which normally would select `C@1.5.0`.  If we specify `C@~1.2.3` as our preferred version,
   * and it selects `C@1.2.9`, then that will be installed for B instead of `C@1.5.0`.  Whereas if the
   * preferred version was `C@~2.0.0` then it would have no effect, because this is incompatible
   * with `C@^1.0.0`.  A compatible parent dependency will take precedence over the preferred version;
   * for example if `A` had a direct dependency on `C@1.2.2`, then `B` would get `C@1.2.2` regardless of the
   * preferred version.
   *
   * Rush's implementation relies on the package manager's heuristic for avoiding duplicates by
   * trying to reuse dependencies requested by a parent in the graph:  The preferred versions
   * are simply injected into the fake common/temp/package.json file that acts as the root
   * for all local projects in the Rush repo.
   */
  public get preferredVersions(): Map<string, string> {
    return this._preferredVersions.protectedView;
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

  private constructor(commonVersionsJson: ICommonVersionsJson | undefined, filePath: string) {
    this._preferredVersions = new ProtectableMap<string, string>(
      { onSet: this._onSetPreferredVersions.bind(this) });

    this._xstitchPreferredVersions = new ProtectableMap<string, string>(
      { onSet: this._onSetPreferredVersions.bind(this) });

    this._allowedAlternativeVersions = new ProtectableMap<string, string[]>(
      { onSet: this._onSetAllowedAlternativeVersions.bind(this) });

    if (commonVersionsJson) {
      try {
        CommonVersionsConfiguration._deserializeTable(this.preferredVersions,
          commonVersionsJson.preferredVersions);
        CommonVersionsConfiguration._deserializeTable(this.xstitchPreferredVersions,
          commonVersionsJson.xstitchPreferredVersions);
        CommonVersionsConfiguration._deserializeTable(this.allowedAlternativeVersions,
          commonVersionsJson.allowedAlternativeVersions);
      } catch (e) {
        throw new Error(`Error loading "${path.basename(filePath)}": ${e.message}`);
      }
    }
    this._filePath = filePath;
  }

  private _onSetPreferredVersions(source: ProtectableMap<string, string>, key: string, value: string): string {
    PackageName.validate(key);

    if (source === this._preferredVersions) {
      if (this._xstitchPreferredVersions.has(key)) {
        throw new Error(`The package "${key}" cannot be added to preferredVersions because it was already`
          + ` added to xstitchPreferredVersions`);
      }
    } else {
      if (this._preferredVersions.has(key)) {
        throw new Error(`The package "${key}" cannot be added to xstitchPreferredVersions because it was already`
          + ` added to preferredVersions`);
      }
    }

    this._modified = true;

    return value;
  }

  private _onSetAllowedAlternativeVersions(source: ProtectableMap<string, string>, key: string, value: string): string {
    PackageName.validate(key);

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
      result.xstitchPreferredVersions = CommonVersionsConfiguration._serializeTable(this.xstitchPreferredVersions);
    }

    if (this._allowedAlternativeVersions.size) {
      result.allowedAlternativeVersions = CommonVersionsConfiguration._serializeTable(this.allowedAlternativeVersions);
    }

    return result;
  }
}
