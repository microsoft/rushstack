// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import ApiPackage from '../apiItem/ApiPackage';
import ApiItem from '../apiItem/ApiItem';
import ApiEnum from '../apiItem/ApiEnum';
import ApiEnumValue from '../apiItem/ApiEnumValue';
import ApiFunction from '../apiItem/ApiFunction';
import ApiStructuredType from '../apiItem/ApiStructuredType';
import ApiMember from '../apiItem/ApiMember';
import ApiMethod from '../apiItem/ApiMethod';
import ApiNamespace from '../apiItem/ApiNamespace';
import ApiParameter from '../apiItem/ApiParameter';
import ApiProperty from '../apiItem/ApiProperty';
import ApiModuleVariable from '../apiItem/ApiModuleVariable';

/**
  * This is a helper class that provides a standard way to walk the ApiItem
  * abstract syntax tree.
  */
abstract class ApiItemVisitor {
  protected visit(apiItem: ApiItem, refObject?: Object): void {
    if (apiItem instanceof ApiStructuredType) {
      this.visitApiStructuredType(apiItem as ApiStructuredType, refObject);
    } else if (apiItem instanceof ApiEnum) {
      this.visitApiEnum(apiItem as ApiEnum, refObject);
    } else if (apiItem instanceof ApiEnumValue) {
      this.visitApiEnumValue(apiItem as ApiEnumValue, refObject);
    } else if (apiItem instanceof ApiFunction) {
      this.visitApiFunction(apiItem as ApiFunction, refObject);
    } else if (apiItem instanceof ApiPackage) {
      this.visitApiPackage(apiItem as ApiPackage, refObject);
    } else if (apiItem instanceof ApiProperty) {
      this.visitApiProperty(apiItem as ApiProperty, refObject);
    } else if (apiItem instanceof ApiMethod) {
      this.visitApiMethod(apiItem as ApiMethod, refObject);
    } else if (apiItem instanceof ApiNamespace) {
      this.visitApiNamespace(apiItem as ApiNamespace, refObject);
    } else if (apiItem instanceof ApiModuleVariable) {
      this.visitApiModuleVariable(apiItem as ApiModuleVariable, refObject);
    } else {
      throw new Error('Not implemented');
    }
  }

  protected abstract visitApiStructuredType(apiStructuredType: ApiStructuredType, refObject?: Object): void;

  protected abstract visitApiEnum(apiEnum: ApiEnum, refObject?: Object): void;

  protected abstract visitApiEnumValue(apiEnumValue: ApiEnumValue, refObject?: Object): void;

  protected abstract visitApiFunction(apiFunction: ApiFunction, refObject?: Object): void;

  protected abstract visitApiPackage(apiPackage: ApiPackage, refObject?: Object): void;

  protected abstract visitApiMember(apiMember: ApiMember, refObject?: Object): void;

  protected abstract visitApiNamespace(apiNamespace: ApiNamespace, refObject?: Object): void;

  protected abstract visitApiModuleVariable(apiModuleVariable: ApiModuleVariable, refObject?: Object): void;

  protected visitApiMethod(apiMethod: ApiMethod, refObject?: Object): void {
    this.visitApiMember(apiMethod, refObject);
  }

  protected visitApiProperty(apiProperty: ApiProperty, refObject?: Object): void {
    this.visitApiMember(apiProperty, refObject);
  }

  protected abstract visitApiParam(apiParam: ApiParameter, refObject?: Object): void;
}

export default ApiItemVisitor;
