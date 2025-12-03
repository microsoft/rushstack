// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import crypto from 'node:crypto';
import * as path from 'node:path';

import {
  JsonFile,
  JsonSchema,
  MapExtensions,
  ProtectableMap,
  FileSystem,
  Sort
} from '@rushstack/node-core-library';

import type { OptionalToUndefined } from '../utilities/Utilities';
import { PackageNameParsers } from './PackageNameParsers';
import { JsonSchemaUrls } from '../logic/JsonSchemaUrls';
import type { RushConfiguration } from './RushConfiguration';
import { RushConstants } from '../logic/RushConstants';
import schemaJson from '../schemas/common-versions.schema.json';

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

  allowedAlternativeVersions?: ICommonVersionsJsonVersionsMap;

  ensureConsistentVersions?: boolean;
}

/**
 * Use this class to load and save the "common/config/rush/common-versions.json" config file.
 * This config file stores dependency version information that affects all projects in the repo.
 * @public
 */
export class CommonVersionsConfiguration {
  private static _jsonSchema: JsonSchema = JsonSchema.fromLoadedObject(schemaJson);

  private _preferredVersions: ProtectableMap<string, string>;
  private _allowedAlternativeVersions: ProtectableMap<string, string[]>;
  private _modified: boolean = false;
  private _commonVersionsJsonHasEnsureConsistentVersionsProperty: boolean;

  /**
   * Get the absolute file path of the common-versions.json file.
   */
  public readonly filePath: string;

  /**
   * When set to true, for all projects in the repo, all dependencies will be automatically added as preferredVersions,
   * except in cases where different projects specify different version ranges for a given dependency.  For older
   * package managers, this tended to reduce duplication of indirect dependencies.  However, it can sometimes cause
   * trouble for indirect dependencies with incompatible peerDependencies ranges.
   *
   * If the value is `undefined`, then the default value is `true`.
   */
  public readonly implicitlyPreferredVersions: boolean | undefined;

  /**
   * If true, then consistent version specifiers for dependencies will be enforced.
   * I.e. "rush check" is run before some commands.
   */
  public readonly ensureConsistentVersions: boolean;

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
  public readonly preferredVersions: Map<string, string>;

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
  public readonly allowedAlternativeVersions: Map<string, ReadonlyArray<string>>;

  private constructor(
    commonVersionsJson: ICommonVersionsJson | undefined,
    filePath: string,
    rushConfiguration: RushConfiguration | undefined
  ) {
    this._preferredVersions = new ProtectableMap<string, string>({
      onSet: this._onSetPreferredVersions.bind(this)
    });
    this.preferredVersions = this._preferredVersions.protectedView;

    if (commonVersionsJson && commonVersionsJson.implicitlyPreferredVersions !== undefined) {
      this.implicitlyPreferredVersions = commonVersionsJson.implicitlyPreferredVersions;
    } else {
      this.implicitlyPreferredVersions = undefined;
    }

    this._allowedAlternativeVersions = new ProtectableMap<string, string[]>({
      onSet: this._onSetAllowedAlternativeVersions.bind(this)
    });
    this.allowedAlternativeVersions = this._allowedAlternativeVersions.protectedView;

    const subspacesFeatureEnabled: boolean | undefined = rushConfiguration?.subspacesFeatureEnabled;
    const rushJsonEnsureConsistentVersions: boolean | undefined =
      rushConfiguration?._ensureConsistentVersionsJsonValue;
    const commonVersionsEnsureConsistentVersions: boolean | undefined =
      commonVersionsJson?.ensureConsistentVersions;
    if (subspacesFeatureEnabled && rushJsonEnsureConsistentVersions !== undefined) {
      throw new Error(
        `When using subspaces, the ensureConsistentVersions config is now defined in the ${RushConstants.commonVersionsFilename} file, ` +
          `you must remove the old setting "ensureConsistentVersions" from ${RushConstants.rushJsonFilename}`
      );
    } else if (
      !subspacesFeatureEnabled &&
      rushJsonEnsureConsistentVersions !== undefined &&
      commonVersionsEnsureConsistentVersions !== undefined
    ) {
      throw new Error(
        `When the ensureConsistentVersions config is defined in the ${RushConstants.rushJsonFilename} file, ` +
          `it cannot also be defined in the ${RushConstants.commonVersionsFilename} file`
      );
    }

    this.ensureConsistentVersions =
      commonVersionsEnsureConsistentVersions ?? rushJsonEnsureConsistentVersions ?? false;
    this._commonVersionsJsonHasEnsureConsistentVersionsProperty =
      commonVersionsEnsureConsistentVersions !== undefined;

    if (commonVersionsJson) {
      try {
        CommonVersionsConfiguration._deserializeTable(
          this.preferredVersions,
          commonVersionsJson.preferredVersions
        );
        CommonVersionsConfiguration._deserializeTable(
          this.allowedAlternativeVersions,
          commonVersionsJson.allowedAlternativeVersions
        );
      } catch (e) {
        throw new Error(`Error loading "${path.basename(filePath)}": ${(e as Error).message}`);
      }
    }
    this.filePath = filePath;
  }

  /**
   * Loads the common-versions.json data from the specified file path.
   * If the file has not been created yet, then an empty object is returned.
   */
  public static loadFromFile(
    jsonFilePath: string,
    rushConfiguration?: RushConfiguration
  ): CommonVersionsConfiguration {
    let commonVersionsJson: ICommonVersionsJson | undefined = undefined;

    if (FileSystem.exists(jsonFilePath)) {
      commonVersionsJson = JsonFile.loadAndValidate(jsonFilePath, CommonVersionsConfiguration._jsonSchema);
    }

    return new CommonVersionsConfiguration(commonVersionsJson, jsonFilePath, rushConfiguration);
  }

  private static _deserializeTable<TValue>(
    map: Map<string, TValue>,
    object: { [key: string]: TValue } | undefined
  ): void {
    if (object) {
      for (const [key, value] of Object.entries(object)) {
        map.set(key, value);
      }
    }
  }

  private static _serializeTable<TValue>(map: Map<string, TValue>): { [key: string]: TValue } {
    const table: { [key: string]: TValue } = {};

    const keys: string[] = [...map.keys()];
    keys.sort();
    for (const key of keys) {
      table[key] = map.get(key)!;
    }

    return table;
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
    const preferredVersionsObj: { [dependency: string]: string } =
      MapExtensions.toObject(orderedPreferredVersions);
    return crypto.createHash('sha1').update(JSON.stringify(preferredVersionsObj)).digest('hex');
  }

  /**
   * Writes the "common-versions.json" file to disk, using the filename that was passed to loadFromFile().
   */
  public save(): boolean {
    if (this._modified) {
      JsonFile.save(this._serialize(), this.filePath, {
        updateExistingFile: true,
        ignoreUndefinedValues: true
      });
      this._modified = false;
      return true;
    }

    return false;
  }

  /**
   * Returns preferredVersions.
   */
  public getAllPreferredVersions(): Map<string, string> {
    const allPreferredVersions: Map<string, string> = new Map<string, string>();
    MapExtensions.mergeFromMap(allPreferredVersions, this.preferredVersions);
    return allPreferredVersions;
  }

  private _onSetPreferredVersions(
    source: ProtectableMap<string, string>,
    key: string,
    value: string
  ): string {
    PackageNameParsers.permissive.validate(key);

    this._modified = true;

    return value;
  }

  private _onSetAllowedAlternativeVersions(
    source: ProtectableMap<string, string[]>,
    key: string,
    value: string[]
  ): string[] {
    PackageNameParsers.permissive.validate(key);

    this._modified = true;

    return value;
  }

  private _serialize(): ICommonVersionsJson {
    let preferredVersions: ICommonVersionsJsonVersionMap | undefined;
    if (this._preferredVersions.size) {
      preferredVersions = CommonVersionsConfiguration._serializeTable(this.preferredVersions);
    }

    let allowedAlternativeVersions: ICommonVersionsJsonVersionsMap | undefined;
    if (this._allowedAlternativeVersions.size) {
      allowedAlternativeVersions = CommonVersionsConfiguration._serializeTable(
        this.allowedAlternativeVersions
      ) as ICommonVersionsJsonVersionsMap;
    }

    const result: OptionalToUndefined<ICommonVersionsJson> = {
      $schema: JsonSchemaUrls.commonVersions,
      preferredVersions,
      implicitlyPreferredVersions: this.implicitlyPreferredVersions,
      allowedAlternativeVersions,
      ensureConsistentVersions: this._commonVersionsJsonHasEnsureConsistentVersionsProperty
        ? this.ensureConsistentVersions
        : undefined
    };
    return result;
  }
}
