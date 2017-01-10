import ApiPackage from './definitions/ApiPackage';
import ApiItem from './definitions/ApiItem';
import ApiEnum from './definitions/ApiEnum';
import ApiEnumValue from './definitions/ApiEnumValue';
import ApiFunction from './definitions/ApiFunction';
import ApiStructuredType from './definitions/ApiStructuredType';
import ApiMember from './definitions/ApiMember';
import ApiMethod from './definitions/ApiMethod';
import ApiParameter from './definitions/ApiParameter';
import ApiProperty from './definitions/ApiProperty';
import { ApiTag } from './definitions/ApiDocumentation';

/**
  * This is a helper class that provides a standard way to walk the ApiItem
  * abstract syntax tree.
  */
abstract class ApiItemVisitor {
  protected apiTagsToSkip: ApiTag[];

  protected visit(apiItem: ApiItem, refObject?: Object): void {
    if (this.apiTagsToSkip && this.apiTagsToSkip.indexOf(apiItem.documentation.apiTag) >= 0) {
      return;
    }

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
    } else if (apiItem instanceof ApiMember) {
      this.visitApiMember(apiItem as ApiMember, refObject);
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

  protected visitApiMethod(apiMethod: ApiMethod, refObject?: Object): void {
    this.visitApiMember(apiMethod, refObject);
  };

  protected visitApiProperty(apiProperty: ApiProperty, refObject?: Object): void {
    this.visitApiMember(apiProperty, refObject);
  };

  protected abstract visitApiParam(apiParam: ApiParameter, refObject?: Object): void;
}

export default ApiItemVisitor;
