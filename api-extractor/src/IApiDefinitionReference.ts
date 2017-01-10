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
export interface IApiDefinitionReference  {

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
