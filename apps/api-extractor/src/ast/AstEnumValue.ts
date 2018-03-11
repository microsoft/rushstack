// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AstItem, AstItemKind, IAstItemOptions } from './AstItem';
import { PrettyPrinter } from '../utils/PrettyPrinter';

/**
 * This class is part of the AstItem abstract syntax tree. It represents a TypeScript enum value.
 * The parent container will always be an AstEnum instance.
 */
export class AstEnumValue extends AstItem {
  constructor(options: IAstItemOptions) {
    super(options);
    this.kind = AstItemKind.EnumValue;
  }

  /**
   * Returns a text string such as "MyValue = 123,"
   */
  public getDeclarationLine(): string {
    return PrettyPrinter.getDeclarationSummary(this.declaration);
  }
}
