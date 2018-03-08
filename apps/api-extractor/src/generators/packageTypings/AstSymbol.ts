// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import { AstImport } from './AstImport';
import { AstDeclaration } from './AstDeclaration';

export interface IAstSymbolParameters {
  followedSymbol: ts.Symbol;
  localName: string;
  astImport: AstImport | undefined;
}

export class AstSymbol {
  /**
   * The original name of the symbol, as exported from the module (i.e. source file)
   * containing the original TypeScript definition.
   */
  public readonly localName: string;

  /**
   * The compiler symbol where this type was defined, after following any aliases.
   */
  public readonly followedSymbol: ts.Symbol;

  public readonly astImport: AstImport | undefined;

  private readonly _astDeclarations: AstDeclaration[];

  public constructor(parameters: IAstSymbolParameters) {
    this.followedSymbol = parameters.followedSymbol;
    this.localName = parameters.localName;
    this.astImport = parameters.astImport;

    this._astDeclarations = [];
  }

  public get astDeclarations(): ReadonlyArray<AstDeclaration> {
    return this._astDeclarations;
  }

  public get mainDeclaration(): AstDeclaration {
    return this._astDeclarations[0];
  }

  public attachDeclaration(astDeclaration: AstDeclaration): void {
    this._astDeclarations.push(astDeclaration);
  }
}
