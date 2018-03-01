// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import { AstItemKind, IAstItemOptions } from './AstItem';
import { AstMember } from './AstMember';

/**
 * This class is part of the AstItem abstract syntax tree. It represents variables
 * that are exported by an AstNamespace (or conceivably an AstPackage in the future).
 * The variables have a name, a type, and an initializer. The AstNamespace implementation
 * currently requires them to use a primitive type and be declared as "const".
 */
export class AstModuleVariable extends AstMember {
  public type: string;
  public name: string;
  public value: string;

  constructor(options: IAstItemOptions) {
    super(options);
    this.kind = AstItemKind.ModuleVariable;

    const propertySignature: ts.PropertySignature = options.declaration as ts.PropertySignature;
    if (propertySignature.type) {
      this.type = propertySignature.type.getText();
    } else {
      this.type = '';
    }

    this.name = propertySignature.name.getText();

    if (propertySignature.initializer) {
      this.value = propertySignature.initializer.getText(); // value of the export
    } else {
      this.value = '';
    }
  }
}
