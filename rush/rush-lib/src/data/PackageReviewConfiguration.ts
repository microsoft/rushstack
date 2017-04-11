// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

import Validator = require('z-schema');
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
 * Part of IPackageReviewJson.
 */
export interface IPackageReviewSettingsJson {
  ignoredNpmScopes?: string[];
}

/**
 * This represents the JSON data structure for the "PackageDependencies.json" configuration file.
 * See packagereview-schema.json for documentation.
 */
export interface IPackageReviewJson {
  $schema: string;
  settings?: IPackageReviewSettingsJson;
  browserPackages: IPackageReviewItemJson[];
  nonBrowserPackages: IPackageReviewItemJson[];
}

export class PackageReviewItem {
  public packageName: string;
  public allowedInBrowser: boolean;
  public allowedCategories: Set<string> = new Set<string>();
}

/**
 * This represents the JSON file specified via the "packageReviewFile" option in rush.json.
 */
export default class PackageReviewConfiguration {
  public items: PackageReviewItem[] = [];
  private _itemsByName: Map<string, PackageReviewItem> = new Map<string, PackageReviewItem>();

  private _ignoredNpmScopes: Set<string> = new Set<string>();

  private _loadedJson: IPackageReviewJson;

  /**
   * Loads the configuration data from PackageDependencies.json and returns
   * an PackageReviewConfiguration object.
   */
  public static loadFromFile(jsonFilename: string): PackageReviewConfiguration {
    const packageReviewJson: IPackageReviewJson = JsonFile.loadJsonFile(jsonFilename);

    // Remove the $schema reference that appears in the configuration object (used for IntelliSense),
    // since we are replacing it with the precompiled version.  The validator.setRemoteReference()
    // API is a better way to handle this, but we'd first need to publish the schema file
    // to a public web server where Visual Studio can find it.
    delete packageReviewJson.$schema;

    const validator: Validator = new Validator({
      breakOnFirstError: true,
      noTypeless: true
    });

    const packageReviewSchema: Object = JsonFile.loadJsonFile(
      path.join(__dirname, '../packagereview-schema.json'));

    if (!validator.validate(packageReviewJson, packageReviewSchema)) {
      const error: Validator.SchemaError = validator.getLastError();

      const detail: Validator.SchemaErrorDetail = error.details[0];
      const errorMessage: string = `Error parsing file '${path.basename(jsonFilename)}',`
        + `section[${detail.path}]:${os.EOL}(${detail.code}) ${detail.message}`;

      console.log(os.EOL + 'ERROR: ' + errorMessage + os.EOL + os.EOL);
      throw new Error(errorMessage);
    }

    return new PackageReviewConfiguration(packageReviewJson, jsonFilename);
  }

  /**
   * DO NOT CALL -- Use PackageReviewConfiguration.loadFromFile() instead.
   */
  constructor(packageReviewJson: IPackageReviewJson, jsonFilename: string) {
    this._loadedJson = packageReviewJson;

    this._ignoredNpmScopes.clear();
    if (packageReviewJson.settings) {
      if (packageReviewJson.settings.ignoredNpmScopes) {
        for (const ignoredNpmScope of packageReviewJson.settings.ignoredNpmScopes) {
          this._ignoredNpmScopes.add(ignoredNpmScope);
        }
      }
    }

    for (const browserPackage of packageReviewJson.browserPackages) {
      this._addItemJson(browserPackage, jsonFilename, true);
    }
    for (const nonBrowserPackage of packageReviewJson.nonBrowserPackages) {
      this._addItemJson(nonBrowserPackage, jsonFilename, false);
    }
  }

  /**
   * A list of NPM package scopes that will be excluded from review (e.g. \"@types\")
   */
  public get ignoredNpmScopes(): Set<string> {
    return this._ignoredNpmScopes;
  }

  public getItemByName(packageName: string): PackageReviewItem {
    return this._itemsByName.get(packageName);
  }

  public addOrUpdatePackage(packageName: string, allowedInBrowser: boolean, reviewCategory: string): void {
    let item: PackageReviewItem = this._itemsByName.get(packageName);
    if (!item) {
      item = new PackageReviewItem();
      item.packageName = packageName;
      item.allowedInBrowser = false;
      this._addItem(item);
    }

    // Broaden (but do not narrow) the approval
    if (allowedInBrowser) {
      item.allowedInBrowser = true;
    }

    if (reviewCategory) {
      item.allowedCategories.add(reviewCategory);
    }
  }

  public saveFile(jsonFilename: string): void {
    // Update the JSON structure that we already loaded, preserving any existing state
    // (which passed schema validation).

    // Only write settings if was there before, or if we have some settings
    const writeSettings: boolean = this._loadedJson.settings !== undefined
      || this._ignoredNpmScopes.size > 0;

    if (writeSettings) {
      if (!this._loadedJson.settings) {
        this._loadedJson.settings = {};
      }
      this._loadedJson.settings.ignoredNpmScopes = Utilities.getSetAsArray(this._ignoredNpmScopes)
        .sort();
    }

    this._loadedJson.browserPackages = [];
    this._loadedJson.nonBrowserPackages = [];

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
      if (item.allowedInBrowser) {
        this._loadedJson.browserPackages.push(itemJson);
      } else {
        this._loadedJson.nonBrowserPackages.push(itemJson);
      }
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
    fsx.writeFileSync(jsonFilename, body);
  }

  /**
   * Helper function only used by the constructor when loading the file.
   */
  private _addItemJson(itemJson: IPackageReviewItemJson, jsonFilename: string, allowedInBrowser: boolean): void {
    if (this._itemsByName.has(itemJson.name)) {
      throw new Error(`Error loading package review file ${jsonFilename}:` + os.EOL
        + ` the name "${itemJson.name}" appears more than once`);
    }

    const item: PackageReviewItem = new PackageReviewItem();
    item.packageName = itemJson.name;
    item.allowedInBrowser = allowedInBrowser;
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
