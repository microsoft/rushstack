// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AstItemKind } from '../ast/AstItem';

/**
 * Supports the conversion between AstItems that are loaded from AstItem to JSON notation
 * and vice versa.
 */
export class ApiJsonConverter {
  private static _KIND_CONSTRUCTOR: string = 'constructor';
  private static _KIND_CLASS: string = 'class';
  private static _KIND_ENUM: string = 'enum';
  private static _KIND_ENUM_VALUE: string = 'enum value';
  private static _KIND_INTERFACE: string = 'interface';
  private static _KIND_FUNCTION: string = 'function';
  private static _KIND_PACKAGE: string = 'package';
  private static _KIND_PROPERTY: string = 'property';
  private static _KIND_METHOD: string = 'method';
  private static _KIND_NAMESPACE: string = 'namespace';
  private static _KIND_MODULEVARIABLE: string = 'module variable';

  /**
   * Uses the lowercase string that represents 'kind' in an API JSON file, and
   * converts it to an AstItemKind enum value.
   * There are two cases we do not include here, (Parameter and StructuredType),
   * this is intential as we do not expect to be loading these kind of JSON object
   * from file.
   */
  public static convertJsonToKind(jsonItemKind: string): AstItemKind {
    switch (jsonItemKind) {
      case (this._KIND_CONSTRUCTOR):
        return AstItemKind.Constructor;
      case (this._KIND_CLASS):
        return AstItemKind.Class;
      case (this._KIND_ENUM):
        return AstItemKind.Enum;
      case (this._KIND_ENUM_VALUE):
        return AstItemKind.EnumValue;
      case (this._KIND_INTERFACE):
        return AstItemKind.Interface;
      case (this._KIND_FUNCTION):
        return AstItemKind.Function;
      case (this._KIND_PACKAGE):
        return AstItemKind.Package;
      case (this._KIND_PROPERTY):
        return AstItemKind.Property;
      case (this._KIND_METHOD):
        return AstItemKind.Method;
      case (this._KIND_NAMESPACE):
        return AstItemKind.Namespace;
      case (this._KIND_MODULEVARIABLE):
        return AstItemKind.ModuleVariable;
      default:
        throw new Error('Unsupported kind when converting JSON item kind to API item kind.');
    }
  }

  /**
   * Converts the an AstItemKind into a lower-case string that is written to API JSON files.
   */
  public static convertKindToJson(astItemKind: AstItemKind): string {
    switch (astItemKind) {
      case (AstItemKind.Constructor):
        return this._KIND_CONSTRUCTOR;
      case (AstItemKind.Class):
        return this._KIND_CLASS;
      case (AstItemKind.Enum):
        return this._KIND_ENUM;
      case (AstItemKind.EnumValue):
        return this._KIND_ENUM_VALUE;
      case (AstItemKind.Interface):
        return this._KIND_INTERFACE;
      case (AstItemKind.Function):
        return this._KIND_FUNCTION;
      case (AstItemKind.Package):
        return this._KIND_PACKAGE;
      case (AstItemKind.Property):
        return this._KIND_PROPERTY;
      case (AstItemKind.Method):
        return this._KIND_METHOD;
      case (AstItemKind.Namespace):
        return this._KIND_NAMESPACE;
      case (AstItemKind.ModuleVariable):
        return this._KIND_MODULEVARIABLE;
      default:
        throw new Error('Unsupported API item kind when converting to string used in API JSON file.');
    }
  }
}