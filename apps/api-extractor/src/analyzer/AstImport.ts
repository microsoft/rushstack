// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Constructor options for AstImport
 */
export interface IAstImportOptions {
  readonly modulePath: string;
  readonly exportName: string;
}

/**
 * For a symbol that was imported from an external package, this tracks the import
 * statement that was used to reach it.
 */
export class AstImport {
  /**
   * The name of the external package (and possibly module path) that this definition
   * was imported from.  If it was defined in the referencing source file, or if it was
   * imported from a local file, or if it is an ambient definition, then externalPackageName
   * will be undefined.
   *
   * Example: "@microsoft/gulp-core-build/lib/IBuildConfig"
   */
  public readonly modulePath: string;

  /**
   * If importPackagePath is defined, then this specifies the export name for the definition.
   *
   * Example: "IBuildConfig"
   */
  public readonly exportName: string;

  /**
   * If importPackagePath and importPackageExportName are defined, then this is a dictionary key
   * that combines them with a colon (":").
   *
   * Example: "@microsoft/gulp-core-build/lib/IBuildConfig:IBuildConfig"
   */
  public readonly key: string;

  public constructor(options: IAstImportOptions) {
    this.modulePath = options.modulePath;
    this.exportName = options.exportName;

    this.key = `${this.modulePath}:${this.exportName}`;
  }
}
