// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import AstPackage from '../ast/AstPackage';
import AstItem from '../ast/AstItem';
import AstEnum from '../ast/AstEnum';
import AstEnumValue from '../ast/AstEnumValue';
import AstFunction from '../ast/AstFunction';
import AstStructuredType from '../ast/AstStructuredType';
import AstMember from '../ast/AstMember';
import AstMethod from '../ast/AstMethod';
import AstNamespace from '../ast/AstNamespace';
import AstParameter from '../ast/AstParameter';
import AstProperty from '../ast/AstProperty';
import AstModuleVariable from '../ast/AstModuleVariable';

/**
  * This is a helper class that provides a standard way to walk the AstItem
  * abstract syntax tree.
  */
abstract class AstItemVisitor {
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

  protected abstract visitAstStructuredType(apiStructuredType: AstStructuredType, refObject?: Object): void;

  protected abstract visitAstEnum(apiEnum: AstEnum, refObject?: Object): void;

  protected abstract visitAstEnumValue(apiEnumValue: AstEnumValue, refObject?: Object): void;

  protected abstract visitAstFunction(apiFunction: AstFunction, refObject?: Object): void;

  protected abstract visitAstPackage(apiPackage: AstPackage, refObject?: Object): void;

  protected abstract visitAstMember(apiMember: AstMember, refObject?: Object): void;

  protected abstract visitAstNamespace(apiNamespace: AstNamespace, refObject?: Object): void;

  protected abstract visitAstModuleVariable(apiModuleVariable: AstModuleVariable, refObject?: Object): void;

  protected visitAstMethod(apiMethod: AstMethod, refObject?: Object): void {
    this.visitAstMember(apiMethod, refObject);
  }

  protected visitAstProperty(apiProperty: AstProperty, refObject?: Object): void {
    this.visitAstMember(apiProperty, refObject);
  }

  protected abstract visitApiParam(apiParam: AstParameter, refObject?: Object): void;
}

export default AstItemVisitor;
