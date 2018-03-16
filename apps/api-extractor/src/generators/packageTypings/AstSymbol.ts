// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import { AstImport } from './AstImport';
import { AstDeclaration } from './AstDeclaration';

/**
 * Constructor parameters for AstSymbol
 */
export interface IAstSymbolParameters {
  readonly followedSymbol: ts.Symbol;
  readonly localName: string;
  readonly astImport: AstImport | undefined;
  readonly rootAstSymbol: AstSymbol | undefined;
}

/**
 * The AstDeclaration and AstSymbol classes are API Extractor's equivalent of the compiler's
 * ts.Declaration and ts.Symbol objects.  They are created by the SymbolTable class.
 *
 * @remarks
 * The AstSymbol represents the ts.Symbol information for an AstDeclaration.  For example,
 * if a method has 3 overloads, each overloaded signature will have its own AstDeclaration,
 * but they will all share a common AstSymbol.
 *
 * For nested definitions, the AstSymbol has a unique parent (i.e. AstSymbol.rootAstSymbol),
 * but the parent/children for each AstDeclaration may be different.
 */
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

  /**
   * If this symbol was imported from another package, that information is tracked here.
   * Otherwies, the value is undefined.
   */
  public readonly astImport: AstImport | undefined;

  private readonly _astDeclarations: AstDeclaration[];

  private readonly _rootAstSymbol: AstSymbol;

  private _analyzed: boolean = false;

  public constructor(parameters: IAstSymbolParameters) {
    this.followedSymbol = parameters.followedSymbol;
    this.localName = parameters.localName;
    this.astImport = parameters.astImport;
    this._rootAstSymbol = parameters.rootAstSymbol || this;
    this._astDeclarations = [];
  }

  /**
   * The one or more declarations for this symbol.
   * For example, if this symbol is a method, then the declarations could be
   * various method overloads.  If this symbol is a namespace, then the declarations
   * might be separate namespace blocks (with the same name).
   */
  public get astDeclarations(): ReadonlyArray<AstDeclaration> {
    return this._astDeclarations;
  }

  /**
   * Returns true if the AstSymbolTable.analyze() was called for this object.
   * See that function for details.
   */
  public get analyzed(): boolean {
    return this._analyzed;
  }

  /**
   * Returns the symbol of the root of the AstDeclaration hierarchy.
   */
  public get rootAstSymbol(): AstSymbol {
    return this._rootAstSymbol;
  }

  /**
   * Returns true if this symbol was imported from another package.
   */
  public get imported(): boolean {
    return !!this.rootAstSymbol.astImport;
  }

  /**
   * This is an internal callback used when the SymbolTable attaches a new
   * AstDeclaration to this object.
   * @internal
   */
  public _notifyDeclarationAttach(astDeclaration: AstDeclaration): void {
    this._astDeclarations.push(astDeclaration);
  }

  /**
   * This is an internal callback used when the SymbolTable.analyze()
   * has processed this object.
   * @internal
   */
  public _notifyAnalyzed(): void {
    this._analyzed = true;
  }

  /**
   * Helper that calls AstDeclaration.forEachDeclarationRecursive() for each AstDeclaration.
   */
  public forEachDeclarationRecursive(action: (astDeclaration: AstDeclaration) => void): void {
    for (const astDeclaration of this.astDeclarations) {
      astDeclaration.forEachDeclarationRecursive(action);
    }
  }
}
