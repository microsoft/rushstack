// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Constructor parameters for AstImport
 *
 * @privateremarks
 * Our naming convention is to use I____Parameters for constructor options and
 * I____Options for general function options.  However the word "parameters" is
 * confusingly similar to the terminology for function parameters modeled by API Extractor,
 * so we use I____Options for both cases in this code base.
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
   * was imported from.
   *
   * Example: "@microsoft/node-core-library/lib/FileSystem"
   */
  public readonly modulePath: string;

  /**
   * If modulePath is defined, then this specifies the export name for the definition.
   *
   * Example: "IBuildConfig"
   */
  public readonly exportName: string;

  /**
   * If modulePath and exportName are defined, then this is a dictionary key
   * that combines them with a colon (":").
   *
   * Example: "@microsoft/node-core-library/lib/FileSystem:FileSystem"
   */
  public readonly key: string;

  public constructor(options: IAstImportOptions) {
    this.modulePath = options.modulePath;
    this.exportName = options.exportName;

    this.key = AstImport.getKey(options);
  }

  /**
   * Allows `AstEntity.localName` to be used as a convenient generalization of `AstSymbol.localName` and
   * `AstImport.exportName`.
   */
  public get localName(): string {
    return this.exportName;
  }

  /**
   * Calculates the lookup key used with `AstImport.key`
   */
  public static getKey(options: IAstImportOptions): string {
    return `${options.modulePath}:${options.exportName}`;
  }
}
