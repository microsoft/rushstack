// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Result object returned by {@link PackageName.tryParse}
 *
 * @public
 */
export interface IParsePackageNameResult {
  /**
   * The parsed NPM scope, or an empty string if there was no scope.  The scope value will
   * always include the at-sign.
   * @remarks
   * For example, if the parsed input was "@scope/example/path", then scope would be "@scope".
   */
  scope: string;

  /**
   * The parsed NPM package name without the scope.
   * @remarks
   * For example, if the parsed input was "@scope/example/path", then the name would be "example".
   */
  unscopedName: string;

  /**
   * If the input string could not be parsed, then this string will contain a nonempty
   * error message.   Otherwise it will be an empty string.
   */
  error: string;
}

/**
 * This class provides methods for finding the nearest "package.json" for a folder
 * and retrieving the name of the package.  The results are cached.
 *
 * @public
 */
export class PackageName {
  // "encodeURIComponent escapes all characters except:  A-Z a-z 0-9 - _ . ! ~ * ' ( )"
  // However, these are disallowed because they are shell characters:      ! ~ * ' ( )
  private static readonly invalidNameCharactersRegExp: RegExp = /[^A-Za-z0-9\-_\.]/;

  /**
   * This attempts to parse a NPM package name that may optionally include a path component.
   * @remarks
   * @returns an {@link IParsePackageNameResult} structure whose `error` property will be
   * nonempty if the string could not be parsed.
   */
  public static tryParse(nameWithPath: string): IParsePackageNameResult {
    const result: IParsePackageNameResult = {
      scope: '',
      unscopedName: '',
      error: ''
    };

    let input: string = nameWithPath;

    if (input === null || input === undefined) {
      result.error = 'The package name must not be null or undefined';
      return result;
    }

    if (input[0] === '@') {
      const indexOfScopeSlash: number = input.indexOf('/');
      if (indexOfScopeSlash <= 0) {
        result.error = 'The scope must be followed by a slash';
        return result;
      }
      // Extract the scope substring
      result.scope = input.substr(0, indexOfScopeSlash + 1);
      input = input.substr(indexOfScopeSlash + 1);
    }

    result.unscopedName = input;

    // Convert "@scope/unscoped-name" --> "scopeunscoped-name"
    const nameWithoutScopeSymbols: string = (result.scope ? result.scope.slice(1, -1) : '')
      + result.unscopedName;

    if (result.unscopedName === '') {
      result.error = 'The package name must not be empty';
      return result;
    }

    // Rules from npmjs.com:
    // "The name must be less than or equal to 214 characters. This includes the scope for scoped packages."
    if (result.scope.length + result.unscopedName.length > 214) {
      result.error = 'A package name cannot be longer than 214 characters';
      return result;
    }

    // "The name can't start with a dot or an underscore."
    if (result.unscopedName[0] === '.' || result.unscopedName[0] === '_') {
      result.error = 'The package name starts with an invalid character';
      return result;
    }

    // "New packages must not have uppercase letters in the name."
    if (nameWithoutScopeSymbols !== nameWithoutScopeSymbols.toLowerCase()) {
      result.error = 'The package name must not contain upper case characters';
      return result;
    }

    // "The name ends up being part of a URL, an argument on the command line, and a folder name.
    // Therefore, the name can't contain any non-URL-safe characters"
    const match: RegExpMatchArray | null = nameWithoutScopeSymbols.match(PackageName.invalidNameCharactersRegExp);
    if (match) {
      result.error = `The package name contains an invalid character: "${match[0]}"`;
      return result;
    }

    return result;
  }

  /**
   * Returns true if the specified package name is valid.
   */
  public static isValidName(packageName: string): boolean {
    const result: IParsePackageNameResult = PackageName.tryParse(packageName);
    return !result.error;
  }
}
