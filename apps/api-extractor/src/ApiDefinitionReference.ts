// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { PackageName } from '@microsoft/node-core-library';
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
 * {@inheritdoc IApiDefinitionReferenceParts}
 */
export class ApiDefinitionReference {
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
   * Stringifies the ApiDefinitionReferenceOptions up and including the
   * scope and package name.
   *
   * Example output: '@microsoft/Utilities'
   */
  public toScopePackageString(): string {
    if (!this.packageName) {
      return '';
    }
    return PackageName.combineParts(this.scopeName, this.packageName);
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
      result += '#';
    }
    return result + `${this.exportName}`;
  }

  /**
   * Stringifies the ApiDefinitionReferenceOptions up and including the
   * scope, package, export and member name.
   *
   * Example output: '@microsoft/Utilities#Parse.parseJsonToString'
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