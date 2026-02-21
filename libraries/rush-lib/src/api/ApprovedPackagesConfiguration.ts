// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { JsonFile, JsonSchema, FileSystem, NewlineKind, InternalError } from '@rushstack/node-core-library';

import { JsonSchemaUrls } from '../logic/JsonSchemaUrls.ts';
import schemaJson from '../schemas/approved-packages.schema.json';
import { RushConstants } from '../logic/RushConstants.ts';

/**
 * Part of IApprovedPackagesJson.
 */
export interface IApprovedPackagesItemJson {
  name: string;
  allowedCategories: string[];
}

/**
 * This represents the JSON data structure for the "browser-approved-packages.json"
 * and "nonbrowser-approved-packages.json" configuration files.  See "approved-packages.schema.json"
 * for documentation.
 */
export interface IApprovedPackagesJson {
  $schema?: string;
  packages: IApprovedPackagesItemJson[];
}

/**
 * An item returned by ApprovedPackagesConfiguration
 * @public
 */
export class ApprovedPackagesItem {
  /**
   * The NPM package name
   */
  public packageName: string;

  /**
   * The project categories that are allowed to use this package.
   */
  public allowedCategories: Set<string> = new Set<string>();

  /**
   * @internal
   */
  public constructor(packageName: string) {
    this.packageName = packageName;
  }
}

/**
 * This represents the JSON file specified via the "approvedPackagesFile" option in rush.json.
 * @public
 */
export class ApprovedPackagesConfiguration {
  private static _jsonSchema: JsonSchema = JsonSchema.fromLoadedObject(schemaJson);

  public items: ApprovedPackagesItem[] = [];

  private _itemsByName: Map<string, ApprovedPackagesItem> = new Map<string, ApprovedPackagesItem>();

  private _loadedJson!: IApprovedPackagesJson;
  private _jsonFilename: string;

  public constructor(jsonFilename: string) {
    this._jsonFilename = jsonFilename;
    this.clear();
  }

  /**
   * Clears all the settings, returning to an empty state.
   */
  public clear(): void {
    this._itemsByName.clear();
    this._loadedJson = {
      // Ensure this comes first in the key ordering
      $schema: '',
      packages: []
    };
  }

  public getItemByName(packageName: string): ApprovedPackagesItem | undefined {
    return this._itemsByName.get(packageName);
  }

  public addOrUpdatePackage(packageName: string, reviewCategory: string): boolean {
    let changed: boolean = false;

    let item: ApprovedPackagesItem | undefined = this._itemsByName.get(packageName);
    if (!item) {
      item = new ApprovedPackagesItem(packageName);
      this._addItem(item);
      changed = true;
    }

    if (reviewCategory && !item.allowedCategories.has(reviewCategory)) {
      item.allowedCategories.add(reviewCategory);
      changed = true;
    }

    return changed;
  }

  /**
   * If the file exists, calls loadFromFile().
   */
  public tryLoadFromFile(approvedPackagesPolicyEnabled: boolean): boolean {
    if (!FileSystem.exists(this._jsonFilename)) {
      return false;
    }

    this.loadFromFile();

    if (!approvedPackagesPolicyEnabled) {
      // eslint-disable-next-line no-console
      console.log(
        `Warning: Ignoring "${path.basename(this._jsonFilename)}" because the` +
          ` "approvedPackagesPolicy" setting was not specified in ${RushConstants.rushJsonFilename}`
      );
    }

    return false;
  }

  /**
   * Loads the configuration data from the filename that was passed to the constructor.
   */
  public loadFromFile(): void {
    const approvedPackagesJson: IApprovedPackagesJson = JsonFile.loadAndValidate(
      this._jsonFilename,
      ApprovedPackagesConfiguration._jsonSchema
    );

    this.clear();

    for (const browserPackage of approvedPackagesJson.packages) {
      this._addItemJson(browserPackage, this._jsonFilename);
    }
  }

  /**
   * Loads the configuration data to the filename that was passed to the constructor.
   */
  public saveToFile(): void {
    // Update the JSON structure that we already loaded, preserving any existing state
    // (which passed schema validation).

    // eslint-disable-next-line dot-notation
    this._loadedJson['$schema'] = JsonSchemaUrls.approvedPackages;

    this._loadedJson.packages = [];

    this.items.sort((a: ApprovedPackagesItem, b: ApprovedPackagesItem) => {
      return a.packageName.localeCompare(b.packageName);
    });

    for (const item of this.items) {
      // Sort the items from the set.
      const allowedCategories: string[] = Array.from(item.allowedCategories);
      allowedCategories.sort();

      const itemJson: IApprovedPackagesItemJson = {
        name: item.packageName,
        allowedCategories: allowedCategories
      };

      this._loadedJson.packages.push(itemJson);
    }

    // Save the file
    let body: string = JsonFile.stringify(this._loadedJson);

    // Unindent the allowedCategories array to improve readability
    body = body.replace(/("allowedCategories": +\[)([^\]]+)/g, (substring: string, ...args: string[]) => {
      return args[0] + args[1].replace(/\s+/g, ' ');
    });

    // Add a header
    body = '// DO NOT ADD COMMENTS IN THIS FILE.  They will be lost when the Rush tool resaves it.\n' + body;

    FileSystem.writeFile(this._jsonFilename, body, {
      convertLineEndings: NewlineKind.CrLf
    });
  }

  /**
   * Helper function only used by the constructor when loading the file.
   */
  private _addItemJson(itemJson: IApprovedPackagesItemJson, jsonFilename: string): void {
    if (this._itemsByName.has(itemJson.name)) {
      throw new Error(
        `Error loading package review file ${jsonFilename}:\n` +
          ` the name "${itemJson.name}" appears more than once`
      );
    }

    const item: ApprovedPackagesItem = new ApprovedPackagesItem(itemJson.name);
    if (itemJson.allowedCategories) {
      for (const allowedCategory of itemJson.allowedCategories) {
        item.allowedCategories.add(allowedCategory);
      }
    }
    this._addItem(item);
  }

  /**
   * Helper function that adds an already created ApprovedPackagesItem to the
   * list and set.
   */
  private _addItem(item: ApprovedPackagesItem): void {
    if (this._itemsByName.has(item.packageName)) {
      throw new InternalError('Duplicate key');
    }
    this.items.push(item);
    this._itemsByName.set(item.packageName, item);
  }
}
