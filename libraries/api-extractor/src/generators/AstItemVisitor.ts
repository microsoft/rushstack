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
  protected visit(apiItem: AstItem, refObject?: Object): void {
    if (apiItem instanceof AstStructuredType) {
      this.visitAstStructuredType(apiItem as AstStructuredType, refObject);
    } else if (apiItem instanceof AstEnum) {
      this.visitAstEnum(apiItem as AstEnum, refObject);
    } else if (apiItem instanceof AstEnumValue) {
      this.visitAstEnumValue(apiItem as AstEnumValue, refObject);
    } else if (apiItem instanceof AstFunction) {
      this.visitAstFunction(apiItem as AstFunction, refObject);
    } else if (apiItem instanceof AstPackage) {
      this.visitAstPackage(apiItem as AstPackage, refObject);
    } else if (apiItem instanceof AstProperty) {
      this.visitAstProperty(apiItem as AstProperty, refObject);
    } else if (apiItem instanceof AstMethod) {
      this.visitAstMethod(apiItem as AstMethod, refObject);
    } else if (apiItem instanceof AstNamespace) {
      this.visitAstNamespace(apiItem as AstNamespace, refObject);
    } else if (apiItem instanceof AstModuleVariable) {
      this.visitAstModuleVariable(apiItem as AstModuleVariable, refObject);
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
