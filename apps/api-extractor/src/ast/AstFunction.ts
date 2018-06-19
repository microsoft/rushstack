// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import { Text } from '@microsoft/node-core-library';

import { AstItem, AstItemKind, IAstItemOptions } from './AstItem';
import { AstParameter } from './AstParameter';
import { TypeScriptHelpers } from '../utils/TypeScriptHelpers';
import { PrettyPrinter } from '../utils/PrettyPrinter';

/**
  * This class is part of the AstItem abstract syntax tree. It represents functions that are directly
  * defined inside a package and are not member of classes, interfaces, or nested type literal expressions
  *
  * @see AstMethod for functions that are members of classes, interfaces, or nested type literal expressions
  */
export class AstFunction extends AstItem {
  public returnType: string;
  public params: AstParameter[];

  constructor(options: IAstItemOptions) {
    super(options);
    this.kind = AstItemKind.Function;

    const methodDeclaration: ts.FunctionDeclaration = options.declaration as ts.FunctionDeclaration;

    // Parameters
    if (methodDeclaration.parameters) {
      this.params = [];
      for (const param of methodDeclaration.parameters) {
        const declarationSymbol: ts.Symbol = TypeScriptHelpers.getSymbolForDeclaration(param);
        const astParameter: AstParameter = new AstParameter({
          context: this.context,
          declaration: param,
          declarationSymbol: declarationSymbol
        });
        this.innerItems.push(astParameter);
        this.params.push(astParameter);
      }
    }

    // Return type
    if (methodDeclaration.type) {
      this.returnType = Text.convertToLf(methodDeclaration.type.getText());
    } else {
      this.hasIncompleteTypes = true;
      this.returnType = 'any';
    }
  }

  /**
   * Returns a text string such as "someName?: SomeTypeName;", or in the case of a type
   * literal expression, returns a text string such as "someName?:".
   */
  public getDeclarationLine(): string {
    return PrettyPrinter.getDeclarationSummary(this.declaration);
  }
}
