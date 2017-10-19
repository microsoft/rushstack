// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  IApiMethod,
  IApiFunction,
  IApiConstructor
} from '@microsoft/api-extractor';

export class RenderingHelpers {

  /**
   * Used to validate a data structure before converting to JSON or YAML format.  Reports
   * an error if there are any undefined members, since "undefined" is not supported in JSON.
   */
  // tslint:disable-next-line:no-any
  public static validateNoUndefinedMembers(json: any, jsonPath: string = ''): void {
    if (!json) {
      return;
    }
    if (typeof json === 'object') {
      for (const key of Object.keys(json)) {
        const keyWithPath: string = jsonPath + '/' + key;
        // tslint:disable-next-line:no-any
        const value: any = json[key];
        if (value === undefined) {
          throw new Error(`The key "${keyWithPath}" is undefined`);
        }
        RenderingHelpers.validateNoUndefinedMembers(value, keyWithPath);
      }
    }

  }

  /**
   * Strips the scope from an NPM package name.  For example, given "@microsoft/decorators"
   * this function would return "decorators".
   */
  public static getUnscopedPackageName(packageName: string): string {
    // If there is a "/", return everything after the last "/"
    return packageName.split('/').slice(-1)[0];
  }

  /**
   * Creates a scoped package name by assembling the scope name and unscoped package name.
   * For example, getScopedPackageName("", "example") returns "example", whereas
   * getScopedPackageName("@ms", "example") returns "@ms/example".
   */
  public static getScopedPackageName(scopeName: string, packageName: string): string {
    if (scopeName) {
      return scopeName + '/' + packageName;
    }
    return packageName;
  }

  /**
   * Generates a concise signature for a function.  Example: "getArea(width, height)"
   */
  public static getConciseSignature(methodName: string, method: IApiMethod | IApiConstructor | IApiFunction): string {
    return methodName + '(' + Object.keys(method.parameters).join(', ') + ')';
  }
}
