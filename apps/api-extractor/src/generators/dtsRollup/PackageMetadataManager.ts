// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import {
  PackageJsonLookup,
  IPackageJson,
  FileSystem,
  JsonFile,
  NewlineKind
} from '@microsoft/node-core-library';
import { Extractor } from '../../extractor/Extractor';

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

  public constructor(packageJsonPath: string, packageJson: IPackageJson, aedocSupported: boolean) {
    this.packageJsonPath = packageJsonPath;
    this.packageJson = packageJson;
    this.aedocSupported = aedocSupported;
  }
}

/**
 * This class maintains a cache of analyzed information obtained from package.json
 * files.  It is built on top of the PackageJsonLookup class.
 *
 * @remarks
 *
 * IMPORTANT: Don't use PackageMetadataManager to analyze source files from the current project:
 * 1. Files such as tsdoc-metadata.json may not have been built yet, and thus may contain incorrect information.
 * 2. The current project is not guaranteed to have a package.json file at all.  For example, API Extractor can
 *    be invoked on a bare .d.ts file.
 *
 * Use ts.program.isSourceFileFromExternalLibrary() to test source files before passing the to PackageMetadataManager.
 */
export class PackageMetadataManager {
  public static tsdocMetadataFilename: string = 'tsdoc-metadata.json';

  private readonly _packageJsonLookup: PackageJsonLookup;
  private readonly _packageMetadataByPackageJsonPath: Map<string, PackageMetadata>
    = new Map<string, PackageMetadata>();

  public static writeTsdocMetadataFile(packageJsonFolder: string): void {
    // This feature is still being standardized: https://github.com/Microsoft/tsdoc/issues/7
    // In the future we will use the @microsoft/tsdoc library to read this file.
    const tsdocMetadataPath: string = path.join(packageJsonFolder,
      'dist', PackageMetadataManager.tsdocMetadataFilename);

    const fileObject: Object = {
      tsdocVersion: '0.12',
      toolPackages: [
        {
           packageName: '@microsoft/api-extractor',
           packageVersion: Extractor.version
        }
      ]
    };

    const fileContent: string =
      '// This file is read by tools that parse documentation comments conforming to the TSDoc standard.\n'
      + '// It should be published with your NPM package.  It should not be tracked by Git.\n'
      + JsonFile.stringify(fileObject);

    FileSystem.writeFile(tsdocMetadataPath, fileContent, {
      convertLineEndings: NewlineKind.CrLf,
      ensureFolderExists: true
    });
  }

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
      const packageJson: IPackageJson = this._packageJsonLookup.loadPackageJson(packageJsonFilePath);

      const packageJsonFolder: string = path.dirname(packageJsonFilePath);

      // This feature is still being standardized: https://github.com/Microsoft/tsdoc/issues/7
      // In the future we will use the @microsoft/tsdoc library to read this file.
      let aedocSupported: boolean = false;

      const tsdocMetadataPath: string = path.join(packageJsonFolder,
        'dist', PackageMetadataManager.tsdocMetadataFilename);

        if (FileSystem.exists(tsdocMetadataPath)) {
        console.log('Found: ' + tsdocMetadataPath);
        // If the file exists at all, assume it was written by API Extractor
        aedocSupported = true;
      } else {
        console.log('NOT FOUND: ' + tsdocMetadataPath);
      }

      packageMetadata = new PackageMetadata(packageJsonFilePath, packageJson, aedocSupported);
      this._packageMetadataByPackageJsonPath.set(packageJsonFilePath, packageMetadata);
    }

    return packageMetadata;
  }

  /**
   * Returns true if the source file is part of a package whose .d.ts files support AEDoc annotations.
   */
  public isAedocSupportedFor(sourceFilePath: string): boolean {
    const packageMetadata: PackageMetadata | undefined = this.tryFetchPackageMetadata(sourceFilePath);
    if (!packageMetadata) {
      return false;
    }
    return packageMetadata.aedocSupported;
  }
}
