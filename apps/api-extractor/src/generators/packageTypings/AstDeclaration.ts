// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import { AstSymbol } from './AstSymbol';
import { Span } from '../../utils/Span';

export interface IAstDeclarationParameters {
  readonly declaration: ts.Declaration;
  readonly astSymbol: AstSymbol;
  readonly parentAstDeclaration: AstDeclaration | undefined;
}

export class AstDeclaration {
  public readonly declaration: ts.Declaration;

  public readonly astSymbol: AstSymbol;

  /**
   * The parent, if this object is nested inside another AstDeclaration.
   */
  public readonly parent: AstDeclaration | undefined;

  private readonly _knownChildren: AstDeclaration[] = [];

  public constructor(parameters: IAstDeclarationParameters) {
    this.declaration = parameters.declaration;
    this.astSymbol = parameters.astSymbol;
    this.parent = parameters.parentAstDeclaration;

    this.astSymbol.notifyDeclarationAttach(this);

    if (this.parent) {
      this.parent.notifyChildAttach(this);
    }
  }

  /**
   * Returns the children for this AstDeclaration.
   * The collection will be empty until AstSymbol.analyzed is true.
   */
  public get children(): AstDeclaration[] {
    return this.astSymbol.analyzed ? this._knownChildren : [];
  }

  public notifyChildAttach(child: AstDeclaration): void {
    if (child.parent !== this) {
      throw new Error('Program Bug: Invalid call to attachChild()');
    }

    this._knownChildren.push(child);
  }

  /**
   * Returns a diagnostic dump of the tree, which reports the hierarchy of
   * AstDefinition objects.
   */
  public getDump(indent: string = ''): string {
    const declarationKind: string = ts.SyntaxKind[this.declaration.kind];
    let result: string = indent + `${this.astSymbol.localName} (${declarationKind})\n`;

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
}
