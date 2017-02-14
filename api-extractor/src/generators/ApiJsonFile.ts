import { ApiItemKind } from '../definitions/ApiItem';

/**
 * Supports the conversion between ApiItems that are loaded from ApiItem to JSON notation
 * and vice versa.
 */
export default class ApiJsonFile {
  private static _KIND_CONSTRUCTOR: string = 'constructor';
  private static _KIND_CLASS: string = 'class';
  private static _KIND_ENUM: string = 'enum';
  private static _KIND_INTERFACE: string = 'interface';
  private static _KIND_FUNCTION: string = 'function';
  private static _KIND_PACKAGE: string = 'package';
  private static _KIND_PROPERTY: string = 'property';
  private static _KIND_METHOD: string = 'method';

  /**
   * Uses the lowercase string that represents 'kind' in an API JSON file, and
   * converts it to an ApiItemKind enum value.
   */
  public static convertJsonToKind(jsonItemKind: string): ApiItemKind {
    switch (jsonItemKind) {
      case (this._KIND_CONSTRUCTOR):
        return ApiItemKind.Constructor;
      case (this._KIND_CLASS):
        return ApiItemKind.Class;
      case (this._KIND_ENUM):
        return ApiItemKind.Enum;
      case (this._KIND_INTERFACE):
        return ApiItemKind.Interface;
      case (this._KIND_FUNCTION):
        return ApiItemKind.Function;
      case (this._KIND_PACKAGE):
        return ApiItemKind.Package;
      case (this._KIND_PROPERTY):
        return ApiItemKind.Property;
      case (this._KIND_METHOD):
        return ApiItemKind.Method;
      default:
        new Error('Unsupported kind when converting JSON item kind to API item kind.');
        break;
    }
  }

  /**
   * Converts the an ApiItemKind into a lower-case string that is written to API JSON files.
   */
  public static convertKindToJson(apiItemKind: ApiItemKind): string {
    switch (apiItemKind) {
      case (ApiItemKind.Constructor):
        return this._KIND_CONSTRUCTOR;
      case (ApiItemKind.Class):
        return this._KIND_CLASS;
      case (ApiItemKind.Enum):
        return this._KIND_ENUM;
      case (ApiItemKind.Interface):
        return this._KIND_INTERFACE;
      case (ApiItemKind.Function):
        return this._KIND_FUNCTION;
      case (ApiItemKind.Package):
        return this._KIND_PACKAGE;
      case (ApiItemKind.Property):
        return this._KIND_PROPERTY;
      case (ApiItemKind.Method):
        return this._KIND_METHOD;
      default:
        new Error('Unsupported API item kind when converting to string used in API JSON file.');
        break;
    }
  }
}