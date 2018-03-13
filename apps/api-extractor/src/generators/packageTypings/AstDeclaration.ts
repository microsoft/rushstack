// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import { AstSymbol } from './AstSymbol';
import { Span } from '../../utils/Span';

export interface IAstDeclarationParameters {
  readonly declaration: ts.Declaration;
  readonly astSymbol: AstSymbol;
  readonly parent: AstDeclaration | undefined;
}

export class AstDeclaration {
  public readonly declaration: ts.Declaration;

  public readonly astSymbol: AstSymbol;

  /**
   * The parent, if this object is nested inside another AstDeclaration.
   */
  public readonly parent: AstDeclaration | undefined;

  private readonly _analyzedChildren: AstDeclaration[] = [];

  private readonly _analyzedReferencedAstSymbolsSet: Set<AstSymbol> = new Set<AstSymbol>();

  public constructor(parameters: IAstDeclarationParameters) {
    this.declaration = parameters.declaration;
    this.astSymbol = parameters.astSymbol;
    this.parent = parameters.parent;

    this.astSymbol.notifyDeclarationAttach(this);

    if (this.parent) {
      this.parent.notifyChildAttach(this);
    }
  }

  /**
   * Returns the children for this AstDeclaration.
   * @remarks
   * The collection will be empty until AstSymbol.analyzed is true.
   */
  public get children(): ReadonlyArray<AstDeclaration> {
    return this.astSymbol.analyzed ? this._analyzedChildren : [];
  }

  /**
   * Returns the AstSymbols referenced by this node (ignoring references
   * belonging to its parent, and ignoring references associated with its
   * children).
   * @remarks
   * The collection will be empty until AstSymbol.analyzed is true.
   */
  public get referencedAstSymbols(): ReadonlyArray<AstSymbol> {
    return this.astSymbol.analyzed ? [...this._analyzedReferencedAstSymbolsSet] : [];
  }

  public notifyChildAttach(child: AstDeclaration): void {
    if (child.parent !== this) {
      throw new Error('Program Bug: Invalid call to attachChild()');
    }

    this._analyzedChildren.push(child);
  }

  /**
   * Returns a diagnostic dump of the tree, which reports the hierarchy of
   * AstDefinition objects.
   */
  public getDump(indent: string = ''): string {
    const declarationKind: string = ts.SyntaxKind[this.declaration.kind];
    let result: string = indent + `+ ${this.astSymbol.localName} (${declarationKind})\n`;

    for (const referencedAstSymbol of this._analyzedReferencedAstSymbolsSet.values()) {
      result += indent + `  ref: ${referencedAstSymbol.localName}\n`;
    }

    for (const child of this.children) {
      result += child.getDump(indent + '  ');
    }

    return result;
  }

  /**
   * Returns a diagnostic dump using Span.getDump(), which reports the detailed
   * compiler structure.
   */
  public getSpanDump(indent: string = ''): string {
    const span: Span = new Span(this.declaration);
    return span.getDump(indent);
  }

  public notifyReferencedAstSymbol(referencedAstSymbol: AstSymbol): void {
    if (this.astSymbol.analyzed) {
      throw new Error('Program Bug: notifyReferencedAstSymbol() called after analysis is already complete');
    }

    for (let current: AstDeclaration | undefined = this; current; current = current.parent) {
      // Don't add references to symbols that are already referenced by a parent
      if (current._analyzedReferencedAstSymbolsSet.has(referencedAstSymbol)) {
        return;
      }
      // Don't add the symbols of parents either
      if (referencedAstSymbol === current.astSymbol) {
        return;
      }
    }

    this._analyzedReferencedAstSymbolsSet.add(referencedAstSymbol);
  }

  /**
   * Visits all the current declaration and all children recursively in a depth-first traversal,
   * and performs the specified action for each one.
   */
  public forEachDeclarationRecursive(action: (astDeclaration: AstDeclaration) => void): void {
    action(this);
    for (const child of this.children) {
      child.forEachDeclarationRecursive(action);
    }
  }
}
