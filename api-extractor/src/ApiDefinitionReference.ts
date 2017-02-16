/**
 * A scope and package name are semantic information within an API reference expression.
 */
export interface IScopePackageName {
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
export default class ApiDefinitionReference {
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
   * This is an optional property to denote that a package name is scoped under this name.
   * For example, a common case is when having the '@microsoft' scope name in the 
   * API definition reference: '\@microsoft/sp-core-library'.
   */
  public scopeName: string;
  /**
   * The name of the package that the exportName belongs to.
   */
  public packageName: string;
  /**
   * The name of the export API item.
   */
  public exportName: string;
  /**
   * The name of the member API item. 
   */
  public memberName: string;

  /**
   * Creates an ApiDefinitionReference instance given strings that symbolize the public
   * properties of ApiDefinitionReference.
   */
  public static createFromParts(scopeName: string,
    packageName: string,
    exportName: string,
    memberName: string): ApiDefinitionReference {
    return new ApiDefinitionReference(scopeName, packageName, exportName, memberName);
  }

  /**
   * Takes an API reference expression of the form '@scopeName/packageName:exportName.memberName'
   * and deconstructs it into an IApiDefinitionReference interface object.
   */
  public static createFromString(apiReferenceExpr: string,
    reportError: (message: string) => void): ApiDefinitionReference {
    if (!apiReferenceExpr || apiReferenceExpr.split(' ').length > 1) {
      reportError('API reference expression must be of the form: ' +
        '\'scopeName/packageName:exportName.memberName | display text\'' +
        'where the \'|\' is required if a display text is provided');
      return;
    }

    let scopeName: string = '';
    let packageName: string = '';
    let exportName: string = '';
    let memberName: string = '';

    // E.g. @microsoft/sp-core-library:Guid.equals
    let parts: string[] = apiReferenceExpr.match(ApiDefinitionReference._packageRegEx);
    if (parts) {
      // parts[1] is of the form ‘@microsoft/sp-core-library’ or ‘sp-core-library’
      const scopePackageName: IScopePackageName = ApiDefinitionReference.parseScopedPackageName(parts[1]);
      scopeName = scopePackageName.scope;
      packageName = scopePackageName.package;
      apiReferenceExpr = parts[2]; // e.g. Guid.equals
    }

    // E.g. Guid.equals
    parts = apiReferenceExpr.match(ApiDefinitionReference._memberRegEx);
    if (parts) {
      exportName = parts[1]; // e.g. Guid, can never be undefined
      memberName = parts[2] ? parts[2] : ''; // e.g. equals
    } else {
      // the export name is required
       throw reportError(`Api reference expression contains invalid characters: ${apiReferenceExpr}`);
    }

    if (!apiReferenceExpr.match(ApiDefinitionReference._exportRegEx)) {
      throw reportError(`Api reference expression contains invalid characters: ${apiReferenceExpr}`);
    }

    return ApiDefinitionReference.createFromParts(scopeName, packageName, exportName, memberName);
  }

  /**
   * For a scoped NPM package name this separates the scope and package parts.  For example:
   * parseScopedPackageName('@my-scope/myproject') = { scope: '@my-scope', package: 'myproject' }
   * parseScopedPackageName('myproject') = { scope: '', package: 'myproject' }
   */
  public static parseScopedPackageName(scopedName: string): IScopePackageName {
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
   * Seperates the name property of an ApiPackage into a scope name and the actual 
   * name of the package.
   */
  public static parseApiPackageName(apiPackageName: string): IScopePackageName {
    const slashIndex: number = apiPackageName.indexOf('/');
    if (slashIndex >= 0) {
      return {
        scope: apiPackageName.substr(0, slashIndex),
        package: apiPackageName.substr(slashIndex + 1)
      };
    } else {
      return { scope: '', package: apiPackageName.substr(slashIndex + 1) };
    }
  }

  /**
   * Stringifies the ApiDefinitionReferenceOptions up and including the
   * scope and package name.
   */
  public toScopePackageString(): string {
    let result: string = '';
    if (this.scopeName) {
      result += `${this.scopeName}/${this.packageName}`;
    } else if (this.packageName) {
      result += `$this.packageName`;
    }
    return result;
  }

  /**
   * Stringifies the ApiDefinitionReferenceOptions up and including the
   * scope, package and export name.
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
   */
  public toMemberString(): string {
    return this.toExportString() + `.${this.memberName}`;
  }

  private constructor(scopeName: string, packageName: string, exportName: string, memberName: string) {
    this.scopeName = scopeName;
    this.packageName = packageName;
    this.exportName = exportName;
    this.memberName = memberName;
  }
}