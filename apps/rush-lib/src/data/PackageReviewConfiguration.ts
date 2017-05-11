// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

import JsonSchemaValidator from '../utilities/JsonSchemaValidator';
import JsonFile from '../utilities/JsonFile';
import Utilities from '../utilities/Utilities';

/**
 * Part of IPackageReviewJson.
 */
export interface IPackageReviewItemJson {
  name: string;
  allowedCategories: string[];
}

/**
 * This represents the JSON data structure for the "PackageDependencies.json" configuration file.
 * See packagereview-schema.json for documentation.
 */
export interface IPackageReviewJson {
  $schema: string;
  packages: IPackageReviewItemJson[];
}

/**
 * An item returned by PackageReviewConfiguration
 * @public
 */
export class PackageReviewItem {
  /**
   * The NPM package name
   */
  public packageName: string;

  /**
   * The project categories that are allowed to use this package.
   */
  public allowedCategories: Set<string> = new Set<string>();
}

/**
 * This represents the JSON file specified via the "packageReviewFile" option in rush.json.
 * @public
 */
export class PackageReviewConfiguration {
  private static _validator: JsonSchemaValidator = undefined;

  public items: PackageReviewItem[] = [];

  private _itemsByName: Map<string, PackageReviewItem> = new Map<string, PackageReviewItem>();

  private _loadedJson: IPackageReviewJson;
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
    this._loadedJson = undefined;
  }

  public getItemByName(packageName: string): PackageReviewItem {
    return this._itemsByName.get(packageName);
  }

  public addOrUpdatePackage(packageName: string, reviewCategory: string): void {
    let item: PackageReviewItem = this._itemsByName.get(packageName);
    if (!item) {
      item = new PackageReviewItem();
      item.packageName = packageName;
      this._addItem(item);
    }

    if (reviewCategory) {
      item.allowedCategories.add(reviewCategory);
    }
  }

  /**
   * Loads the configuration data from the filename that was passed to the constructor.
   */
  public loadFromFile(): void {
    if (!PackageReviewConfiguration._validator) {
      const schemaFilename: string = path.join(__dirname, '../approved-packages-schema.json');
      PackageReviewConfiguration._validator = JsonSchemaValidator.loadFromFile(schemaFilename);
    }

    const packageReviewJson: IPackageReviewJson = JsonFile.loadJsonFile(this._jsonFilename);

    PackageReviewConfiguration._validator.validateObject(packageReviewJson, (errorDescription: string) => {
      throw new Error(`Error parsing file '${path.basename(this._jsonFilename)}':\n`
        + errorDescription);
    });

    this.clear();

    for (const browserPackage of packageReviewJson.packages) {
      this._addItemJson(browserPackage, this._jsonFilename);
    }
  }

  /**
   * Loads the configuration data to the filename that was passed to the constructor.
   */
  public saveToFile(): void {
    // Update the JSON structure that we already loaded, preserving any existing state
    // (which passed schema validation).

    this._loadedJson.packages = [];

    this.items.sort((a: PackageReviewItem, b: PackageReviewItem) => {
      return a.packageName.localeCompare(b.packageName);
    });

    for (const item of this.items) {
      // Sort the items from the set.  Too bad we can't use the new Array.from().
      const allowedCategories: string[] = Utilities.getSetAsArray(item.allowedCategories);
      allowedCategories.sort();

      const itemJson: IPackageReviewItemJson = {
        name: item.packageName,
        allowedCategories: allowedCategories
      };

      this._loadedJson.packages.push(itemJson);
    }

    // Save the file
    let body: string = JSON.stringify(this._loadedJson, undefined, 2) + '\n';

    // Unindent the allowedCategories array to improve readability
    body = body.replace(
      /("allowedCategories": +\[)([^\]]+)/g,
      (substring: string, ...args: string[]) => {
        return args[0] + args[1].replace(/\s+/g, ' ');
      }
    );

    // Add a header
    body = '// DO NOT ADD COMMENTS IN THIS FILE.'
      + '  They will be lost when the Rush tool resaves it.\n' + body;

    body = Utilities.getAllReplaced(body, '\n', '\r\n');
    fsx.writeFileSync(this._jsonFilename, body);
  }

  /**
   * Helper function only used by the constructor when loading the file.
   */
  private _addItemJson(itemJson: IPackageReviewItemJson, jsonFilename: string): void {
    if (this._itemsByName.has(itemJson.name)) {
      throw new Error(`Error loading package review file ${jsonFilename}:` + os.EOL
        + ` the name "${itemJson.name}" appears more than once`);
    }

    const item: PackageReviewItem = new PackageReviewItem();
    item.packageName = itemJson.name;
    if (itemJson.allowedCategories) {
      for (const allowedCategory of itemJson.allowedCategories) {
        item.allowedCategories.add(allowedCategory);
      }
    }
    this._addItem(item);
  }

  /**
   * Helper function that adds an already created PackageReviewItem to the
   * list and set.
   */
  private _addItem(item: PackageReviewItem): void {
    if (this._itemsByName.has(item.packageName)) {
      throw new Error('Duplicate key'); // this is a program bug
    }
    this.items.push(item);
    this._itemsByName.set(item.packageName, item);
  }
}
