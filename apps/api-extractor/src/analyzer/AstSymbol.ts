// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import { AstImport } from './AstImport';
import { AstDeclaration } from './AstDeclaration';
import { InternalError } from '@microsoft/node-core-library';

/**
 * Constructor options for AstSymbol
 */
export interface IAstSymbolOptions {
  readonly followedSymbol: ts.Symbol;
  readonly localName: string;
  readonly astImport: AstImport | undefined;
  readonly nominalAnalysis: boolean;
  readonly parentAstSymbol: AstSymbol | undefined;
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
   *
   * @remarks
   * This is a normal form that can be reached from any symbol alias by calling
   * `TypeScriptHelpers.followAliases()`.  It can be compared to determine whether two
   * symbols refer to the same underlying type.
   */
  public readonly followedSymbol: ts.Symbol;

  /**
   * If the working package imported this symbol from an external package,
   * then that information is tracked here.  Otherwise, the value is undefined.
   *
   * @remarks
   * The `astImport` property will be undefined if it was declared in the local project,
   * or if it is an ambient definition.
   */
  public readonly astImport: AstImport | undefined;

  /**
   * If true, then this AstSymbol represents a foreign object whose structure will be
   * ignored.  The AstDeclaration will not have any parent or children, and its references
   * will not be analyzed.
   *
   * Nominal symbols are tracked because we still need to emit exports for them.
   */
  public readonly nominalAnalysis: boolean;

  /**
   * Returns the symbol of the parent of this AstSymbol, or undefined if there is no parent.
   * @remarks
   * If a symbol has multiple declarations, we assume (as an axiom) that their parent
   * declarations will belong to the same symbol.  This means that the "parent" of a
   * symbol is a well-defined concept.  However, the "children" of a symbol are not very
   * meaningful, because different declarations may have different nested members,
   * so we usually need to traverse declarations to find children.
   */
  public readonly parentAstSymbol: AstSymbol | undefined;

  /**
   * Returns the symbol of the root of the AstDeclaration hierarchy.
   * @remarks
   * NOTE: If this AstSymbol is the root, then rootAstSymbol will point to itself.
   */
  public readonly rootAstSymbol: AstSymbol;

  /**
   * Additional information applied later by the Collector.
   */
  public metadata: unknown;

  private readonly _astDeclarations: AstDeclaration[];

  // This flag is unused if this is not the root symbol.
  // Being "analyzed" is a property of the root symbol.
  private _analyzed: boolean = false;

  public constructor(options: IAstSymbolOptions) {
    this.followedSymbol = options.followedSymbol;
    this.localName = options.localName;
    this.astImport = options.astImport;
    this.nominalAnalysis = options.nominalAnalysis;
    this.parentAstSymbol = options.parentAstSymbol;
    this.rootAstSymbol = options.rootAstSymbol || this;
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
   * @remarks
   * AstSymbolTable.analyze() is always performed on the root AstSymbol.  This function
   * returns true if-and-only-if the root symbol was analyzed.
   */
  public get analyzed(): boolean {
    return this.rootAstSymbol._analyzed;
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
    if (this.analyzed) {
      throw new InternalError('_notifyDeclarationAttach() called after analysis is already complete');
    }
    this._astDeclarations.push(astDeclaration);
  }

  /**
   * This is an internal callback used when the SymbolTable.analyze()
   * has processed this object.
   * @internal
   */
  public _notifyAnalyzed(): void {
    if (this.parentAstSymbol) {
      throw new InternalError('_notifyAnalyzed() called for an AstSymbol which is not the root');
    }
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
