// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import * as path from 'path';
import {
  JsonFile,
  FileSystem,
  FileConstants
} from '@microsoft/node-core-library';

import {
  ApiItem,
  IApiPackage,
  ApiMember
} from './api/ApiItem';

import { ApiDefinitionReference } from './ApiDefinitionReference';
import { AstItem } from './ast/AstItem';
import { AstItemContainer } from './ast/AstItemContainer';
import { AstPackage } from './ast/AstPackage';
import { ResolvedApiItem } from './ResolvedApiItem';
import { ApiJsonFile } from './api/ApiJsonFile';
import { IReferenceResolver } from './aedoc/ApiDocumentation';

/**
 * A loader for locating the ApiItem associated with a given project and API item, or
 * for locating an AstItem  locally.
 * No processing on the ApiItem orAstItem  should be done in this class, this class is only
 * concerned with communicating state.
 * The ApiItem can then be used to enforce correct API usage, like enforcing internal.
 * To use DocItemLoader: provide a projectFolder to construct a instance of the DocItemLoader,
 * then use DocItemLoader.getItem to retrieve the ApiItem of a particular API item.
 */
export class DocItemLoader implements IReferenceResolver {
  private _cache: Map<string, IApiPackage>;
  private _projectFolder: string; // Root directory to check for node modules

  /**
   * The projectFolder is the top-level folder containing package.json for a project
   * that we are compiling.
   */
  constructor(projectFolder: string) {
    if (!FileSystem.exists(path.join(projectFolder, FileConstants.PackageJson))) {
      throw new Error(`An NPM project was not found in the specified folder: ${projectFolder}`);
    }

    this._projectFolder = projectFolder;
    this._cache = new Map<string, IApiPackage>();
  }

  /**
   * {@inheritdoc IReferenceResolver.resolve}
   */
  public resolve(apiDefinitionRef: ApiDefinitionReference,
    astPackage: AstPackage,
    warnings: string[]): ResolvedApiItem | undefined {

    // We determine if an 'apiDefinitionRef' is local if it has no package name or if the scoped
    // package name is equal to the current package's scoped package name.
    if (!apiDefinitionRef.packageName || apiDefinitionRef.toScopePackageString() === astPackage.name) {
      // Resolution for local references
      return this.resolveLocalReferences(apiDefinitionRef, astPackage, warnings);

    } else {

      // If there was no resolved astItem then try loading from JSON
      return this.resolveJsonReferences(apiDefinitionRef, warnings);
    }
  }

  /**
   * Resolution of API definition references in the scenario that the reference given indicates
   * that we should search within the current AstPackage to resolve.
   * No processing on the AstItem should be done here, this class is only concerned
   * with communicating state.
   */
  public resolveLocalReferences(apiDefinitionRef: ApiDefinitionReference,
    astPackage: AstPackage,
    warnings: string[]): ResolvedApiItem | undefined {

    let astItem: AstItem | undefined = astPackage.getMemberItem(apiDefinitionRef.exportName);
    // Check if export name was not found
    if (!astItem) {
      warnings.push(`Unable to find referenced export \"${apiDefinitionRef.toExportString()}\"`);
      return undefined;
    }

    // If memberName exists then check for the existence of the name
    if (apiDefinitionRef.memberName) {
      if (astItem instanceof AstItemContainer) {
        const astItemContainer: AstItemContainer = (astItem as AstItemContainer);
        // get() returns undefined if there is no match
        astItem = astItemContainer.getMemberItem(apiDefinitionRef.memberName);
      } else {
        // There are no other instances of astItem that has members,
        // thus there must be a mistake with the apiDefinitionRef.
        astItem = undefined;
      }
    }

    if (!astItem) {
      // If we are here, we can be sure there was a problem with the memberName.
      // memberName was not found, apiDefinitionRef is invalid
      warnings.push(`Unable to find referenced member \"${apiDefinitionRef.toMemberString()}\"`);
      return undefined;
    }

    return ResolvedApiItem.createFromAstItem(astItem);
  }

  /**
   * Resolution of API definition references in the scenario that the reference given indicates
   * that we should search outside of this AstPackage and instead search within the JSON API file
   * that is associated with the apiDefinitionRef.
   */
  public resolveJsonReferences(apiDefinitionRef: ApiDefinitionReference,
    warnings: string[]): ResolvedApiItem | undefined {

    // Check if package can be not found
    const docPackage: IApiPackage | undefined =  this.getPackage(apiDefinitionRef);
    if (!docPackage) {
      // package not found in node_modules
      warnings.push(`Unable to find a documentation file (\"${apiDefinitionRef.packageName}.api.json\")` +
        ' for the referenced package');
      return undefined;
    }

    // found JSON package, now ensure export name is there
    // hasOwnProperty() not needed for JJU objects
    if (!(apiDefinitionRef.exportName in docPackage.exports)) {
      warnings.push(`Unable to find referenced export \"${apiDefinitionRef.toExportString()}\""`);
      return undefined;
    }

    let docItem: ApiItem = docPackage.exports[apiDefinitionRef.exportName];

    // If memberName exists then check for the existence of the name
    if (apiDefinitionRef.memberName) {
      let member: ApiMember | undefined = undefined;
      switch (docItem.kind) {
        case 'class':

          // hasOwnProperty() not needed for JJU objects
          member = apiDefinitionRef.memberName in docItem.members ?
            docItem.members[apiDefinitionRef.memberName] : undefined;
          break;
        case 'interface':
          // hasOwnProperty() not needed for JJU objects
          member = apiDefinitionRef.memberName in docItem.members ?
            docItem.members[apiDefinitionRef.memberName] : undefined;
          break;
        case 'enum':
        // hasOwnProperty() not needed for JJU objects
          member = apiDefinitionRef.memberName in docItem.values ?
            docItem.values[apiDefinitionRef.memberName] : undefined;
          break;
        default:
          // Any other docItem.kind does not have a 'members' property
          break;
      }

      if (member) {
        docItem = member;
      } else {
        // member name was not found, apiDefinitionRef is invalid
        warnings.push(`Unable to find referenced member \"${apiDefinitionRef.toMemberString()}\"`);
        return undefined;
      }
    }

    return ResolvedApiItem.createFromJson(docItem);
  }

  /**
   * Attempts to locate and load the IApiPackage object from the project folder's
   * node modules. If the package already exists in the cache, nothing is done.
   *
   * @param apiDefinitionRef - interface with properties pertaining to the API definition reference
   */
  public getPackage(apiDefinitionRef: ApiDefinitionReference): IApiPackage | undefined {
    let cachePackageName: string = '';

    // We concatenate the scopeName and packageName in case there are packageName conflicts
    if (apiDefinitionRef.scopeName) {
      cachePackageName = `${apiDefinitionRef.scopeName}/${apiDefinitionRef.packageName}`;
    } else {
      cachePackageName = apiDefinitionRef.packageName;
    }
    // Check if package exists in cache
    if (this._cache.has(cachePackageName)) {
      return this._cache.get(cachePackageName);
    }

    // Doesn't exist in cache, attempt to load the json file
    const apiJsonFilePath: string =  path.join(
      this._projectFolder,
      'node_modules',
      apiDefinitionRef.scopeName,
      apiDefinitionRef.packageName,
      `dist/${apiDefinitionRef.packageName}.api.json`
    );

    if (!FileSystem.exists(path.join(apiJsonFilePath))) {
      // Error should be handled by the caller
      return undefined;
    }

    return this.loadPackageIntoCache(apiJsonFilePath, cachePackageName);
  }

  /**
   * Loads the API documentation json file and validates that it conforms to our schema. If it does,
   * then the json file is saved in the cache and returned.
   */
  public loadPackageIntoCache(apiJsonFilePath: string, cachePackageName: string): IApiPackage {
    const astPackage: IApiPackage = JsonFile.loadAndValidate(apiJsonFilePath, ApiJsonFile.jsonSchema, {
      customErrorHeader: 'The API JSON file does not conform to the expected schema, and may' + os.EOL
        + 'have been created by an incompatible release of API Extractor:'
    });

    this._cache.set(cachePackageName, astPackage);
    return astPackage;
  }
}
