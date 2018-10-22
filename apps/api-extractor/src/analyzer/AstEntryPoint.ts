// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AstSymbol } from './AstSymbol';

/**
 * Constructor options for AstEntryPoint
 */
export interface IExportedMember {
  readonly name: string;
  readonly astSymbol: AstSymbol;
}

export interface IAstEntryPointOptions {
  readonly exportedMembers: ReadonlyArray<IExportedMember>;
}

/**
 * This class is used by AstSymbolTable to return an entry point.
 * (If AstDeclaration could be used to represent a ts.SyntaxKind.SourceFile node,
 * then this class would not be needed.)
 */
export class AstEntryPoint {
  public readonly exportedMembers: ReadonlyArray<IExportedMember>;

  public constructor(options: IAstEntryPointOptions) {
    this.exportedMembers = options.exportedMembers;
  }
}
