// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AstModule } from './AstModule';
import { AstSyntheticEntity } from './AstEntity';

export interface IAstImportAsModuleOptions {
  readonly astModule: AstModule;
  readonly exportName: string;
}

// TODO [MA]: add documentation
export class AstImportAsModule extends AstSyntheticEntity {
  // TODO [MA]: add documentation
  public analyzed: boolean = false;

  // TODO [MA]: add documentation
  public readonly astModule: AstModule;

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

  public constructor(options: IAstImportAsModuleOptions) {
    super();
    this.astModule = options.astModule;
    this.exportName = options.exportName;
  }

  /** {@inheritdoc} */
  public get localName(): string { // abstract
    return this.exportName;
  }
}