// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import { AstItemKind } from './AstItem';
import AstItemContainer from './AstItemContainer';
import { IAstItemOptions } from './AstItem';
import AstEnumValue from './AstEnumValue';
import TypeScriptHelpers from '../TypeScriptHelpers';

/**
 * This class is part of the AstItem abstract syntax tree. It represents a TypeScript enum definition.
 * The individual enum values are represented using AstEnumValue.
 */
export default class AstEnum extends AstItemContainer {
  constructor(options: IAstItemOptions) {
    super(options);
    this.kind = AstItemKind.Enum;

    for (const memberDeclaration of (options.declaration as ts.EnumDeclaration).members) {
      const memberSymbol: ts.Symbol = TypeScriptHelpers.getSymbolForDeclaration(memberDeclaration);

      const memberOptions: IAstItemOptions = {
        extractor: this.extractor,
        declaration: memberDeclaration,
        declarationSymbol: memberSymbol,
        jsdocNode: memberDeclaration
      };

      this.addMemberItem(new AstEnumValue(memberOptions));
    }

  }
}
