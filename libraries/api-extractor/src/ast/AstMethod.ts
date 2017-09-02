// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import { AstItemKind, IAstItemOptions } from './AstItem';
import AstMember from './AstMember';
import AstParameter from './AstParameter';
import TypeScriptHelpers from '../TypeScriptHelpers';
import { ITextElement, ICodeLinkElement } from '../markup/OldMarkup';
import ApiDefinitionReference, { IScopedPackageName } from '../ApiDefinitionReference';

/**
 * This class is part of the AstItem abstract syntax tree. It represents functions that are members of
 * classes, interfaces, or nested type literal expressions. Unlike AstFunctions, AstMethods can have
 * access modifiers (public, private, etc.) or be optional, because they are members of a structured type
 *
 * @see AstFunction for functions that are defined inside of a package
 */
export default class AstMethod extends AstMember {
  public readonly returnType: string;
  public readonly params: AstParameter[];
  private readonly _isConstructor: boolean;

  constructor(options: IAstItemOptions) {
    super(options);
    this.kind = AstItemKind.Method;

    const methodDeclaration: ts.MethodDeclaration = options.declaration as ts.MethodDeclaration;

    // Parameters
    if (methodDeclaration.parameters) {
      this.params = [];
      for (const param of methodDeclaration.parameters) {
        const declarationSymbol: ts.Symbol = TypeScriptHelpers.tryGetSymbolForDeclaration(param);
        const astParameter: AstParameter = new AstParameter({
          extractor: this.extractor,
          declaration: param,
          declarationSymbol: declarationSymbol,
          jsdocNode: param
        });

        this.innerItems.push(astParameter);
        this.params.push(astParameter);
      }
    }

    // tslint:disable-next-line:no-bitwise
    this._isConstructor = (options.declarationSymbol.flags & ts.SymbolFlags.Constructor) !== 0;

    // Return type
    if (!this.isConstructor) {
      if (methodDeclaration.type) {
        this.returnType = methodDeclaration.type.getText();
      } else {
        this.returnType = 'any';
        this.hasIncompleteTypes = true;
      }
    }
  }

  /**
   * Returns true if this member represents a class constructor.
   */
  public get isConstructor(): boolean {
    return this._isConstructor;
  }

  protected onCompleteInitialization(): void {
    super.onCompleteInitialization();

    // If this is a class constructor, and if the documentation summary was omitted, then
    // we fill in a default summary versus flagging it as "undocumented".
    // Generally class constructors have uninteresting documentation.
    if (this.isConstructor) {
      if (this.documentation.summary.length === 0) {
        this.documentation.summary.push({
          kind: 'textDocElement',
          value: 'Constructs a new instance of the '
        } as ITextElement);

        const scopedPackageName: IScopedPackageName = ApiDefinitionReference
          .parseScopedPackageName(this.extractor.package.name);

        this.documentation.summary.push({
          kind: 'linkDocElement',
          referenceType: 'code',
          scopeName: scopedPackageName.scope,
          packageName: scopedPackageName.package,
          exportName: this.parentContainer.name,
          value: this.parentContainer.name
        } as ICodeLinkElement);

        this.documentation.summary.push({
          kind: 'textDocElement',
          value: ' class'
        } as ITextElement);
      }
      this.needsDocumentation = false;
    }
  }
}
