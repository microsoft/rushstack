// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import { AstItem, AstItemKind, IAstItemOptions } from './AstItem';

/**
 * This class is part of the AstItem abstract syntax tree. It represents parameters of a function declaration
 */
export class AstParameter extends AstItem {
  public isOptional: boolean;
  public type: string;

  /**
   * If there is a spread operator before the parameter declaration
   * Example: foo(...params: string[])
   */
  public isSpread: boolean;

  constructor(options: IAstItemOptions, docComment?: string) {
    super(options);
    this.kind = AstItemKind.Parameter;

    const parameterDeclaration: ts.ParameterDeclaration = options.declaration as ts.ParameterDeclaration;
    this.isOptional = !!parameterDeclaration.questionToken || !!parameterDeclaration.initializer;
    if (parameterDeclaration.type) {
      this.type = parameterDeclaration.type.getText();
    } else {
      this.hasIncompleteTypes = true;
      this.type = 'any';
    }

    this.isSpread = !!parameterDeclaration.dotDotDotToken;
  }
}
