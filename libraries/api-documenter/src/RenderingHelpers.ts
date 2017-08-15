// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export class RenderingHelpers {
  /**
   * Used to validate a data structure before writing.  Reports an error if there
   * are any undefined members.
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

  public static getDocId(packageName: string, exportName?: string, memberName?: string): string {
    let result: string = RenderingHelpers.getUnscopedPackageName(packageName);
    if (exportName) {
      result += '.' + exportName;
      if (memberName === '__constructor') {
        result += '.' + '-ctor';
      } else if (memberName) {
        result += '.' + memberName;
      }
    }
    return result.toLowerCase();
  }

  public static getUnscopedPackageName(packageName: string): string {
    // If there is a "/", return everything after the last "/"
    return packageName.split('/').slice(-1)[0];
  }
}
