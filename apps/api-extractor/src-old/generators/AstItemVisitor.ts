// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AstPackage } from '../ast/AstPackage';
import { AstItem } from '../ast/AstItem';
import { AstEnum } from '../ast/AstEnum';
import { AstEnumValue } from '../ast/AstEnumValue';
import { AstFunction } from '../ast/AstFunction';
import { AstStructuredType } from '../ast/AstStructuredType';
import { AstMember } from '../ast/AstMember';
import { AstMethod } from '../ast/AstMethod';
import { AstNamespace } from '../ast/AstNamespace';
import { AstProperty } from '../ast/AstProperty';
import { AstModuleVariable } from '../ast/AstModuleVariable';

/**
  * This is a helper class that provides a standard way to walk the AstItem
  * abstract syntax tree.
  */
export abstract class AstItemVisitor {
  protected visit(astItem: AstItem, refObject?: Object): void {
    if (astItem instanceof AstStructuredType) {
      this.visitAstStructuredType(astItem as AstStructuredType, refObject);
    } else if (astItem instanceof AstEnum) {
      this.visitAstEnum(astItem as AstEnum, refObject);
    } else if (astItem instanceof AstEnumValue) {
      this.visitAstEnumValue(astItem as AstEnumValue, refObject);
    } else if (astItem instanceof AstFunction) {
      this.visitAstFunction(astItem as AstFunction, refObject);
    } else if (astItem instanceof AstPackage) {
      this.visitAstPackage(astItem as AstPackage, refObject);
    } else if (astItem instanceof AstProperty) {
      this.visitAstProperty(astItem as AstProperty, refObject);
    } else if (astItem instanceof AstMethod) {
      this.visitAstMethod(astItem as AstMethod, refObject);
    } else if (astItem instanceof AstNamespace) {
      this.visitAstNamespace(astItem as AstNamespace, refObject);
    } else if (astItem instanceof AstModuleVariable) {
      this.visitAstModuleVariable(astItem as AstModuleVariable, refObject);
    } else {
      throw new Error('Not implemented');
    }
  }

  protected abstract visitAstStructuredType(astStructuredType: AstStructuredType, refObject?: Object): void;

  protected abstract visitAstEnum(astEnum: AstEnum, refObject?: Object): void;

  protected abstract visitAstEnumValue(astEnumValue: AstEnumValue, refObject?: Object): void;

  protected abstract visitAstFunction(astFunction: AstFunction, refObject?: Object): void;

  protected abstract visitAstPackage(astPackage: AstPackage, refObject?: Object): void;

  protected abstract visitAstMember(astMember: AstMember, refObject?: Object): void;

  protected abstract visitAstNamespace(astNamespace: AstNamespace, refObject?: Object): void;

  protected abstract visitAstModuleVariable(astModuleVariable: AstModuleVariable, refObject?: Object): void;

  protected visitAstMethod(astMethod: AstMethod, refObject?: Object): void {
    this.visitAstMember(astMethod, refObject);
  }

  protected visitAstProperty(astProperty: AstProperty, refObject?: Object): void {
    this.visitAstMember(astProperty, refObject);
  }
}
