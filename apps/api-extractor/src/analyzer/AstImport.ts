// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AstSymbol } from './AstSymbol';

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
  readonly starImport?: boolean;
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
   * For statements of the form `import * as x from "y";`, `starImport` will be true,
   * and `exportName` will be the namespace identifier (e.g. `x` in this example).
   */
  public readonly starImport: boolean;

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
    this.modulePath = options.modulePath;
    this.exportName = options.exportName;
    this.starImport = options.starImport || false;

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
    if (options.starImport) {
      return `${options.modulePath}:*`;
    } else {
      return `${options.modulePath}:${options.exportName}`;
    }
  }
}
