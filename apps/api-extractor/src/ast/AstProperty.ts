// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import { Text } from '@microsoft/node-core-library';

import { AstItemKind, IAstItemOptions } from './AstItem';
import { AstMember } from './AstMember';

/**
 * This class is part of the AstItem abstract syntax tree. It represents properties of classes or interfaces
 * (It does not represent member methods)
 */
export class AstProperty extends AstMember {
  public type: string;
  public isStatic: boolean;
  public isReadOnly: boolean;
  public isEventProperty: boolean;

  constructor(options: IAstItemOptions) {
    super(options);
    this.kind = AstItemKind.Property;

    const declaration: ts.PropertyDeclaration = options.declaration as ts.PropertyDeclaration;
    if (declaration.type) {
      this.type = Text.convertToLf(declaration.type.getText());
    } else {
      this.hasIncompleteTypes = true;
      this.type = 'any';
    }

    if (this.documentation.hasReadOnlyTag) {
      this.isReadOnly = true;
    } else {
      // Check for a readonly modifier
      for (const modifier of declaration.modifiers || []) {
        if (modifier.kind === ts.SyntaxKind.ReadonlyKeyword) {
          this.isReadOnly = true;
        }
      }
    }

    this.isEventProperty = this.documentation.isEventProperty || false;
    if (this.isEventProperty && !this.isReadOnly) {
      this.reportWarning('The @eventProperty tag requires the property to be readonly');
    }
  }

  public getDeclarationLine(): string {
    return super.getDeclarationLine({
      type: this.type,
      readonly: this.isReadOnly
    });
  }
}
