// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A package name that has been separated into its scope and unscoped name.
 *
 * @public
 */
export interface IParsedPackageName {
  /**
   * The parsed NPM scope, or an empty string if there was no scope.  The scope value will
   * always include the at-sign.
   * @remarks
   * For example, if the parsed input was "\@scope/example", then scope would be "\@scope".
   */
  scope: string;

  /**
   * The parsed NPM package name without the scope.
   * @remarks
   * For example, if the parsed input was "\@scope/example", then the name would be "example".
   */
  unscopedName: string;
}

/**
 * Result object returned by {@link PackageName.tryParse}
 *
 * @public
 */
export interface IParsedPackageNameOrError extends IParsedPackageName {
  /**
   * If the input string could not be parsed, then this string will contain a nonempty
   * error message.  Otherwise it will be an empty string.
   */
  error: string;
}

/**
 * Various functions for working with package names that may include scopes.
 *
 * @public
 */
export class PackageName {
  // encodeURIComponent() escapes all characters except:  A-Z a-z 0-9 - _ . ! ~ * ' ( )
  // However, these are disallowed because they are shell characters:       ! ~ * ' ( )
  private static readonly invalidNameCharactersRegExp: RegExp = /[^A-Za-z0-9\-_\.]/;

  /**
   * This attempts to parse a package name that may include a scope component.
   * The packageName must not be an empty string.
   * @remarks
   * This function will not throw an exception.
   *
   * @returns an {@link IParsedPackageNameOrError} structure whose `error` property will be
   * nonempty if the string could not be parsed.
   */
  public static tryParse(packageName: string): IParsedPackageNameOrError {
    const result: IParsedPackageNameOrError = {
      scope: '',
      unscopedName: '',
      error: ''
    };

    let input: string = packageName;

    if (input === null || input === undefined) {
      result.error = 'The package name must not be null or undefined';
      return result;
    }

    // Rule from npmjs.com:
    // "The name must be less than or equal to 214 characters. This includes the scope for scoped packages."
    if (packageName.length > 214) {
      // Don't attempt to parse a ridiculously long input
      result.error = 'The package name cannot be longer than 214 characters';
      return result;
    }

    if (input[0] === '@') {
      const indexOfScopeSlash: number = input.indexOf('/');
      if (indexOfScopeSlash <= 0) {
        result.scope = input;
        result.error = `Error parsing "${packageName}": The scope must be followed by a slash`;
        return result;
      }

      // Extract the scope substring
      result.scope = input.substr(0, indexOfScopeSlash);

      input = input.substr(indexOfScopeSlash + 1);
    }

    result.unscopedName = input;

    if (result.scope === '@') {
      result.error = `Error parsing "${packageName}": The scope name cannot be empty`;
      return result;
    }

    if (result.unscopedName === '') {
      result.error = 'The package name must not be empty';
      return result;
    }

    // Rule from npmjs.com:
    // "The name can't start with a dot or an underscore."
    if (result.unscopedName[0] === '.' || result.unscopedName[0] === '_') {
      result.error = `The package name "${packageName}" starts with an invalid character`;
      return result;
    }

    // Convert "@scope/unscoped-name" --> "scopeunscoped-name"
    const nameWithoutScopeSymbols: string = (result.scope ? result.scope.slice(1, -1) : '')
      + result.unscopedName;

    // "New packages must not have uppercase letters in the name."
    // This can't be enforced because "old" packages are still actively maintained.
    // Example: https://www.npmjs.com/package/Base64
    // However it's pretty reasonable to require the scope to be lower case
    if (result.scope !== result.scope.toLowerCase()) {
      result.error = `The package scope "${result.scope}" must not contain upper case characters`;
      return result;
    }

    // "The name ends up being part of a URL, an argument on the command line, and a folder name.
    // Therefore, the name can't contain any non-URL-safe characters"
    const match: RegExpMatchArray | null = nameWithoutScopeSymbols.match(PackageName.invalidNameCharactersRegExp);
    if (match) {
      result.error = `The package name "${packageName}" contains an invalid character: "${match[0]}"`;
      return result;
    }

    return result;
  }

  /**
   * Same as {@link PackageName.tryParse}, except this throws an exception if the input
   * cannot be parsed.
   * @remarks
   * The packageName must not be an empty string.
   */
  public static parse(packageName: string): IParsedPackageName {
    const result: IParsedPackageNameOrError = PackageName.tryParse(packageName);
    if (result.error) {
      throw new Error(result.error);
    }
    return result;
  }

  /**
   * {@inheritDoc IParsedPackageName.scope}
   */
  public static getScope(packageName: string): string {
    return PackageName.parse(packageName).scope;
  }

  /**
   * {@inheritDoc IParsedPackageName.unscopedName}
   */
  public static getUnscopedName(packageName: string): string {
    return PackageName.parse(packageName).unscopedName;
  }

  /**
   * Returns true if the specified package name is valid, or false otherwise.
   * @remarks
   * This function will not throw an exception.
   */
  public static isValidName(packageName: string): boolean {
    const result: IParsedPackageNameOrError = PackageName.tryParse(packageName);
    return !result.error;
  }

  /**
   * Throws an exception if the specified name is not a valid package name.
   * The packageName must not be an empty string.
   */
  public static validate(packageName: string): void {
    PackageName.parse(packageName);
  }

  /**
   * Combines an optional package scope with an unscoped root name.
   * @param scope - Must be either an empty string, or a scope name such as "\@example"
   * @param unscopedName - Must be a nonempty package name that does not contain a scope
   * @returns A full package name such as "\@example/some-library".
   */
  public static combineParts(scope: string, unscopedName: string): string {
    if (scope !== '') {
      if (scope[0] !== '@') {
        throw new Error('The scope must start with an "@" character');
      }
    }
    if (scope.indexOf('/') >= 0) {
      throw new Error('The scope must not contain a "/" character');
    }

    if (unscopedName[0] === '@') {
      throw new Error('The unscopedName cannot start with an "@" character');
    }
    if (unscopedName.indexOf('/') >= 0) {
      throw new Error('The unscopedName must not contain a "/" character');
    }

    let result: string;
    if (scope === '') {
      result = unscopedName;
    } else {
      result = scope + '/' + unscopedName;
    }

    // Make sure the result is a valid package name
    PackageName.validate(result);

    return result;
  }
}
