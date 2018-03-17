// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  PackageJsonLookup,
  IPackageJson
} from '@microsoft/node-core-library';

/**
 * Represents analyzed information for a package.json file.
 * This object is constructed and returned by PackageMetadataManager.
 */
export class PackageMetadata {
  /**
   * The absolute path to the package.json file being analyzed.
   */
  public readonly packageJsonPath: string;
  /**
   * The parsed contents of package.json.  Note that PackageJsonLookup
   * only includes essential fields.
   */
  public readonly packageJson: IPackageJson;
  /**
   * If true, then the package's documentation comments can be assumed
   * to contain API Extractor compatible TSDoc tags.
   */
  public readonly aedocSupported: boolean;

  private readonly _packageJsonLookup: PackageJsonLookup;

  public constructor(packageJsonPath: string, packageJsonLookup: PackageJsonLookup) {
    this._packageJsonLookup = packageJsonLookup;
    this.packageJsonPath = packageJsonPath;

    this.packageJson = this._packageJsonLookup.loadPackageJson(packageJsonPath);

    this.aedocSupported = false;

    if (this.packageJson.tsdoc) {
      if (this.packageJson.tsdoc.tsdocFlavor) {
        if (this.packageJson.tsdoc.tsdocFlavor.toUpperCase() === 'AEDOC') {
          this.aedocSupported = true;
        }
      }
    }
  }
}

/**
 * This class maintains a cache of analyzed information obtained from package.json
 * files.  It is built on top of the PackageJsonLookup class.
 */
export class PackageMetadataManager {
  private readonly _packageJsonLookup: PackageJsonLookup;
  private readonly _packageMetadataByPackageJsonPath: Map<string, PackageMetadata>
    = new Map<string, PackageMetadata>();

  public constructor(packageJsonLookup: PackageJsonLookup) {
    this._packageJsonLookup = packageJsonLookup;
  }

  /**
   * Finds the package.json in a parent folder of the specified source file, and
   * returns a PackageMetadata object.  If no package.json was found, then undefined
   * is returned.  The results are cached.
   */
  public tryFetchPackageMetadata(sourceFilePath: string): PackageMetadata | undefined {
    const packageJsonFilePath: string | undefined
      = this._packageJsonLookup.tryGetPackageJsonFilePathFor(sourceFilePath);
    if (!packageJsonFilePath) {
      return undefined;
    }
    let packageMetadata: PackageMetadata | undefined
      = this._packageMetadataByPackageJsonPath.get(packageJsonFilePath);
    if (!packageMetadata) {
      packageMetadata = new PackageMetadata(packageJsonFilePath, this._packageJsonLookup);
      this._packageMetadataByPackageJsonPath.set(packageJsonFilePath, packageMetadata);
    }
    return packageMetadata;
  }

  /**
   * Returns true if the source file has an associated PackageMetadata object
   * with aedocSupported=true.
   */
  public isAedocSupportedFor(sourceFilePath: string): boolean {
    const packageMetadata: PackageMetadata | undefined = this.tryFetchPackageMetadata(sourceFilePath);
    if (!packageMetadata) {
      return false;
    }
    return packageMetadata.aedocSupported;
  }
}
