// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IApiItemReference } from './api/ApiItem';

/**
 * An API definition reference that is used to locate the documentation of exported
 * API items that may or may not belong to an external package.
 *
 * The format of the API definition reference is:
 * scopeName/packageName:exportName.memberName
 *
 * The following are valid API definition references:
 * \@microsoft/sp-core-library:DisplayMode
 * \@microsoft/sp-core-library:Guid
 * \@microsoft/sp-core-library:Guid.equals
 * es6-collections:Map
 */
export interface IApiDefinitionReferenceParts {
  /**
   * This is an optional property to denote that a package name is scoped under this name.
   * For example, a common case is when having the '@microsoft' scope name in the
   * API definition reference: '\@microsoft/sp-core-library'.
   */
  scopeName: string;
  /**
   * The name of the package that the exportName belongs to.
   */
  packageName: string;
  /**
   * The name of the export API item.
   */
  exportName: string;
  /**
   * The name of the member API item.
   */
  memberName: string;
}

/**
 * A scope and package name are semantic information within an API reference expression.
 * If there is no scope or package, then the corresponding values will be an empty string.
 *
 * Example: '@microsoft/Utilities' -> \{ scope: '@microsoft', package: 'Utilities' \}
 * Example: 'Utilities' -> \{ scope: '', package: 'Utilities' \}
 */
export interface IScopedPackageName {
  /**
   * The scope name of an API reference expression.
   */
  scope: string;

  /**
   * The package name of an API reference expression.
   */
  package: string;
}

/**
 * {@inheritdoc IApiDefinitionReferenceParts}
 */
export class ApiDefinitionReference {
  /**
   * Splits an API reference expression into two parts, first part is the scopename/packageName and
   * the second part is the exportName.memberName.
   */
  private static _packageRegEx: RegExp = /^([^:]*)\:(.*)$/;

  /**
   * Splits the exportName.memberName into two respective parts.
   */
  private static _memberRegEx: RegExp = /^([^.|:]*)(?:\.(\w+))?$/;

  /**
   * Used to ensure that the export name contains only text characters.
   */
  private static _exportRegEx: RegExp =  /^\w+/;

  /**
   * {@inheritdoc IApiDefinitionReferenceParts.scopeName}
   */
  public scopeName: string;
  /**
   * {@inheritdoc IApiDefinitionReferenceParts.packageName}
   */
  public packageName: string;
  /**
   * {@inheritdoc IApiDefinitionReferenceParts.exportName}
   */
  public exportName: string;
  /**
   * {@inheritdoc IApiDefinitionReferenceParts.memberName}
   */
  public memberName: string;

  /**
   * Creates an ApiDefinitionReference instance given strings that symbolize the public
   * properties of ApiDefinitionReference.
   */
  public static createFromParts(parts: IApiDefinitionReferenceParts): ApiDefinitionReference {
    return new ApiDefinitionReference(parts);
  }

  /**
   * Takes an API reference expression of the form '@scopeName/packageName:exportName.memberName'
   * and deconstructs it into an IApiDefinitionReference interface object.
   * @returns the ApiDefinitionReference, or undefined if an error was reported.
   */
  public static createFromString(apiReferenceExpr: string,
    reportError: (message: string) => void): ApiDefinitionReference | undefined {
    if (!apiReferenceExpr || apiReferenceExpr.split(' ').length > 1) {
      reportError('An API item reference must use the notation: "@scopeName/packageName:exportName.memberName"');
      return undefined;
    }

    const apiDefRefParts: IApiDefinitionReferenceParts = {
      scopeName: '',
      packageName: '',
      exportName: '',
      memberName: ''
    };

    // E.g. @microsoft/sp-core-library:Guid.equals
    let parts: string[] | null = apiReferenceExpr.match(ApiDefinitionReference._packageRegEx);
    if (parts) {
      // parts[1] is of the form ‘@microsoft/sp-core-library’ or ‘sp-core-library’
      const scopePackageName: IScopedPackageName = ApiDefinitionReference.parseScopedPackageName(parts[1]);
      apiDefRefParts.scopeName = scopePackageName.scope;
      apiDefRefParts.packageName = scopePackageName.package;
      apiReferenceExpr = parts[2]; // e.g. Guid.equals
    }

    // E.g. Guid.equals
    parts = apiReferenceExpr.match(ApiDefinitionReference._memberRegEx);
    if (parts) {
      apiDefRefParts.exportName = parts[1]; // e.g. Guid, can never be undefined
      apiDefRefParts.memberName = parts[2] ? parts[2] : ''; // e.g. equals
    } else {
      // the export name is required
      reportError(`The API item reference contains an invalid "exportName.memberName"`
        + ` expression: "${apiReferenceExpr}"`);
      return undefined;
    }

    if (!apiReferenceExpr.match(ApiDefinitionReference._exportRegEx)) {
      reportError(`The API item reference contains invalid characters: "${apiReferenceExpr}"`);
      return undefined;
    }

    return ApiDefinitionReference.createFromParts(apiDefRefParts);
  }

  /**
   * For a scoped NPM package name this separates the scope and package parts.  For example:
   * parseScopedPackageName('@my-scope/myproject') = { scope: '@my-scope', package: 'myproject' }
   * parseScopedPackageName('myproject') = { scope: '', package: 'myproject' }
   */
  public static parseScopedPackageName(scopedName: string): IScopedPackageName {
    if (scopedName.substr(0, 1) !== '@') {
      return { scope: '', package: scopedName };
    }

    const slashIndex: number = scopedName.indexOf('/');
    if (slashIndex >= 0) {
      return { scope: scopedName.substr(0, slashIndex), package: scopedName.substr(slashIndex + 1) };
    } else {
      throw new Error('Invalid scoped name: ' + scopedName);
    }
  }

  /**
   * Stringifies the ApiDefinitionReferenceOptions up and including the
   * scope and package name.
   *
   * Example output: '@microsoft/Utilities'
   */
  public toScopePackageString(): string {
    let result: string = '';
    if (this.scopeName) {
      result += `${this.scopeName}/${this.packageName}`;
    } else if (this.packageName) {
      result += this.packageName;
    }
    return result;
  }

  /**
   * Stringifies the ApiDefinitionReferenceOptions up and including the
   * scope, package and export name.
   *
   * Example output: '@microsoft/Utilities.Parse'
   */
  public toExportString(): string {
    let result: string = this.toScopePackageString();
    if (result) {
      result += ':';
    }
    return result + `${this.exportName}`;
  }

  /**
   * Stringifies the ApiDefinitionReferenceOptions up and including the
   * scope, package, export and member name.
   *
   * Example output: '@microsoft/Utilities.Parse.parseJsonToString'
   */
  public toMemberString(): string {
    return this.toExportString() + `.${this.memberName}`;
  }

  public toApiItemReference(): IApiItemReference {
    return {
      scopeName: this.scopeName,
      packageName: this.packageName,
      exportName: this.exportName,
      memberName: this.memberName
    };
  }

  private constructor(parts: IApiDefinitionReferenceParts) {
    this.scopeName = parts.scopeName;
    this.packageName = parts.packageName;
    this.exportName = parts.exportName;
    this.memberName = parts.memberName;
  }
}