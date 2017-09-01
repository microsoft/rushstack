// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import { ApiItemKind, IApiItemOptions } from './ApiItem';
import ApiMember from './ApiMember';

/**
 * This class is part of the ApiItem abstract syntax tree. It represents variables
 * that are exported by an ApiNamespace (or conceivably an ApiPackage in the future).
 * The variables have a name, a type, and an initializer. The ApiNamespace implementation
 * currently requires them to use a primitive type and be declared as "const".
 */
class ApiModuleVariable extends ApiMember {
  public type: string;
  public name: string;
  public value: string;

  constructor(options: IApiItemOptions) {
    super(options);
    this.kind = ApiItemKind.ModuleVariable;

    const propertySignature: ts.PropertySignature = options.declaration as ts.PropertySignature;
    this.type = propertySignature.type.getText();
    this.name = propertySignature.name.getText();
    this.value = propertySignature.initializer.getText(); // value of the export
  }
}

export default ApiModuleVariable;
