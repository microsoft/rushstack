// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import { AstItem, AstItemKind, IAstItemOptions } from './AstItem';

/**
 * This class is part of the AstItem abstract syntax tree. It represents a TypeScript enum value.
 * The parent container will always be an AstEnum instance.
 */
export class AstTypeAlias extends AstItem {
  public type: string;

  constructor(options: IAstItemOptions) {
    super(options);
    this.kind = AstItemKind.TypeAlias;

    const typeAliasDeclaration: ts.TypeAliasDeclaration = options.declaration as ts.TypeAliasDeclaration;
    if (typeAliasDeclaration.type) {
      this.type = typeAliasDeclaration.type.getText();
    } else {
      this.type = '';
    }
  }
}
