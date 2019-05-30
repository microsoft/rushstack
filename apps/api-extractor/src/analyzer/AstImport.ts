// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AstSymbol } from './AstSymbol';
import { InternalError } from '@microsoft/node-core-library';

/**
 * Indicates the import kind for an `AstImport`.
 */
export enum AstImportKind {
  /**
   * An import statement such as `import X from "y";`.
   */
  DefaultImport,

  /**
   * An import statement such as `import { X } from "y";`.
   */
  NamedImport,

  /**
   * An import statement such as `import * as x from "y";`.
   */
  StarImport,

  /**
   * An import statement such as `import x = require("y");`.
   */
  EqualsImport
}

/**
 * Constructor parameters for AstImport
 *
 * @privateRemarks
 * Our naming convention is to use I____Parameters for constructor options and
 * I____Options for general function options.  However the word "parameters" is
 * confusingly similar to the terminology for function parameters modeled by API Extractor,
 * so we use I____Options for both cases in this code base.
 */
export interface IAstImportOptions {
  readonly importKind: AstImportKind;
  readonly modulePath: string;
  readonly exportName: string;
}

/**
 * For a symbol that was imported from an external package, this tracks the import
 * statement that was used to reach it.
 */
export class AstImport {
  public readonly importKind: AstImportKind;

  /**
   * The name of the external package (and possibly module path) that this definition
   * was imported from.
   *
   * Example: "@microsoft/node-core-library/lib/FileSystem"
   */
  public readonly modulePath: string;

  /**
   * The name of the symbol being imported.
   *
   * @remarks
   *
   * The name depends on the type of import:
   *
   * ```ts
   * // For AstImportKind.DefaultImport style, exportName would be "X" in this example:
   * import X from "y";
   *
   * // For AstImportKind.NamedImport style, exportName would be "X" in this example:
   * import { X } from "y";
   *
   * // For AstImportKind.StarImport style, exportName would be "x" in this example:
   * import * as x from "y";
   *
   * // For AstImportKind.EqualsImport style, exportName would be "x" in this example:
   * import x = require("y");
   * ```
   */
  public readonly exportName: string;

  /**
   * If this import statement refers to an API from an external package that is tracked by API Extractor
   * (according to `PackageMetadataManager.isAedocSupportedFor()`), then this property will return the
   * corresponding AstSymbol.  Otherwise, it is undefined.
   */
  public astSymbol: AstSymbol | undefined;

  /**
   * If modulePath and exportName are defined, then this is a dictionary key
   * that combines them with a colon (":").
   *
   * Example: "@microsoft/node-core-library/lib/FileSystem:FileSystem"
   */
  public readonly key: string;

  public constructor(options: IAstImportOptions) {
    this.importKind = options.importKind;
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
    switch (options.importKind) {
      case AstImportKind.DefaultImport:
        return `${options.modulePath}:${options.exportName}`;
      case AstImportKind.NamedImport:
        return `${options.modulePath}:${options.exportName}`;
      case AstImportKind.StarImport:
        return `${options.modulePath}:*`;
      case AstImportKind.EqualsImport:
        return `${options.modulePath}:=`;
      default:
        throw new InternalError('Unknown AstImportKind');
    }
  }
}
