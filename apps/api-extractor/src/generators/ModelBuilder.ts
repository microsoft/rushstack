// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import { ExtractorContext } from '../analyzer/ExtractorContext';
import { AstSymbolTable } from '../analyzer/AstSymbolTable';
import { AstEntryPoint } from '../analyzer/AstEntryPoint';
import { ApiModel } from '../api/model/ApiModel';
import { AstDeclaration } from '../analyzer/AstDeclaration';
import { ApiClass } from '../api/model/ApiClass';
import { ApiPackage } from '../api/model/ApiPackage';
import { ApiEntryPoint } from '../api/model/ApiEntryPoint';
import { ApiMethod } from '../api/model/ApiMethod';
import { ApiNamespace } from '../api/model/ApiNamespace';
import { IApiItemContainer } from '../api/mixins/ApiItemContainerMixin';
import { ApiInterface } from '../api/model/ApiInterface';
import { ApiPropertySignature } from '../api/model/ApiPropertySignature';
import { ApiParameter } from '../api/mixins/ApiFunctionLikeMixin';

export class ModelBuilder {
  private readonly _context: ExtractorContext;
  private readonly _astSymbolTable: AstSymbolTable;
  private _astEntryPoint: AstEntryPoint | undefined;
  private readonly _apiModel: ApiModel;
  private readonly _cachedOverloadIndexesByDeclaration: Map<AstDeclaration, number>;

  public constructor(context: ExtractorContext) {
    this._context = context;
    this._astSymbolTable = new AstSymbolTable(this._context.typeChecker, this._context.packageJsonLookup);
    this._apiModel = new ApiModel();
    this._cachedOverloadIndexesByDeclaration = new Map<AstDeclaration, number>();
  }

  public process(): void {
    const apiPackage: ApiPackage = new ApiPackage({ name: this._context.packageName });
    this._apiModel.addMember(apiPackage);

    const apiEntryPoint: ApiEntryPoint = new ApiEntryPoint({ name: '' });
    apiPackage.addMember(apiEntryPoint);

    // Build the entry point
    this._astEntryPoint = this._astSymbolTable.fetchEntryPoint(this._context.entryPointSourceFile);

    // Create a DtsEntry for each top-level export
    for (const exportedMember of this._astEntryPoint.exportedMembers) {
      for (const astDeclaration of exportedMember.astSymbol.astDeclarations) {
        this._processDeclaration(astDeclaration, exportedMember.name, apiEntryPoint);
      }
    }

    apiPackage.saveToJsonFile('d:\\serialize.json');

    const test: ApiModel = new ApiModel();
    const testPackage: ApiPackage = test.loadPackage('d:\\serialize.json');
    testPackage.saveToJsonFile('d:\\serialize2.json');

    debugger;
  }

  public _processDeclaration(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: IApiItemContainer): void {

    switch (astDeclaration.declaration.kind) {
      case ts.SyntaxKind.ClassDeclaration:
        this._processApiClass(astDeclaration, exportedName, parentApiItem);
        break;

      case ts.SyntaxKind.InterfaceDeclaration:
        this._processApiInterface(astDeclaration, exportedName, parentApiItem);
        break;

      case ts.SyntaxKind.MethodDeclaration:
        this._processApiMethod(astDeclaration, exportedName, parentApiItem);
        break;

      case ts.SyntaxKind.ModuleDeclaration:
        this._processApiNamespace(astDeclaration, exportedName, parentApiItem);
        break;

      case ts.SyntaxKind.PropertySignature:
        this._processApiPropertySignature(astDeclaration, exportedName, parentApiItem);
        break;

      case ts.SyntaxKind.MethodSignature:
      case ts.SyntaxKind.Constructor:
      case ts.SyntaxKind.ConstructSignature:
      case ts.SyntaxKind.EnumDeclaration:
      case ts.SyntaxKind.EnumMember:
      case ts.SyntaxKind.FunctionDeclaration:
      case ts.SyntaxKind.IndexSignature:
      case ts.SyntaxKind.PropertyDeclaration:
      case ts.SyntaxKind.TypeAliasDeclaration:
      case ts.SyntaxKind.VariableDeclaration:
      default:
    }
  }

  private _processChildDeclarations(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: IApiItemContainer): void {
    for (const childDeclaration of astDeclaration.children) {
      this._processDeclaration(childDeclaration, undefined, parentApiItem);
    }
  }

  private _processApiClass(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: IApiItemContainer): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;
    const canonicalReference: string = ApiClass.getCanonicalReference(name);

    let apiClass: ApiClass | undefined = parentApiItem.tryGetMember(canonicalReference) as ApiClass;

    if (apiClass === undefined) {
      apiClass = new ApiClass({ name, signature: '' });
      parentApiItem.addMember(apiClass);
    }

    this._processChildDeclarations(astDeclaration, exportedName, apiClass);
  }

  private _processApiInterface(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: IApiItemContainer): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;
    const canonicalReference: string = ApiInterface.getCanonicalReference(name);

    let apiInterface: ApiClass | undefined = parentApiItem.tryGetMember(canonicalReference) as ApiInterface;

    if (apiInterface === undefined) {
      apiInterface = new ApiInterface({ name, signature: '' });
      parentApiItem.addMember(apiInterface);
    }

    this._processChildDeclarations(astDeclaration, exportedName, apiInterface);
  }

  private _processApiMethod(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: IApiItemContainer): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;

    const methodDeclaration: ts.MethodDeclaration = astDeclaration.declaration as ts.MethodDeclaration;

    let isStatic: boolean = false;
    if (methodDeclaration.modifiers) {
      for (const modifier of methodDeclaration.modifiers) {
        if (modifier.kind === ts.SyntaxKind.StaticKeyword) {
          isStatic = true;
        }
      }
    }

    const overloadIndex: number = this._getOverloadIndex(astDeclaration);
    const canonicalReference: string = ApiMethod.getCanonicalReference(name, isStatic, overloadIndex);

    let apiMethod: ApiMethod | undefined = parentApiItem.tryGetMember(canonicalReference) as ApiMethod;

    if (apiMethod === undefined) {
      apiMethod = new ApiMethod({ name, signature: '', isStatic, overloadIndex });

      for (const parameter of methodDeclaration.parameters) {
        apiMethod.addParameter(new ApiParameter({
          name: parameter.name.getText() || ''
        }));
      }

      parentApiItem.addMember(apiMethod);
    }
  }

  private _processApiNamespace(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: IApiItemContainer): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;
    const canonicalReference: string = ApiNamespace.getCanonicalReference(name);

    let apiNamespace: ApiNamespace | undefined = parentApiItem.tryGetMember(canonicalReference) as ApiNamespace;

    if (apiNamespace === undefined) {
      apiNamespace = new ApiNamespace({ name, signature: '' });
      parentApiItem.addMember(apiNamespace);
    }

    this._processChildDeclarations(astDeclaration, exportedName, apiNamespace);
  }

  private _processApiPropertySignature(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: IApiItemContainer): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;
    const canonicalReference: string = ApiPropertySignature.getCanonicalReference(name);

    let apiPropertySignature: ApiPropertySignature | undefined
      = parentApiItem.tryGetMember(canonicalReference) as ApiNamespace;

    if (apiPropertySignature === undefined) {
      apiPropertySignature = new ApiPropertySignature({ name, signature: '' });
      parentApiItem.addMember(apiPropertySignature);
    } else {
      // If the property was already declared before (via a merged interface declaration),
      // we assume its signature is identical, because the language requires that.
    }
  }

  private _getOverloadIndex(astDeclaration: AstDeclaration): number {
    const allDeclarations: ReadonlyArray<AstDeclaration> = astDeclaration.astSymbol.astDeclarations;
    if (allDeclarations.length === 1) {
      return 0; // trivial case
    }

    let overloadIndex: number | undefined = this._cachedOverloadIndexesByDeclaration.get(astDeclaration);

    if (overloadIndex === undefined) {
      let nextIndex: number = 0;
      for (const other of allDeclarations) {
        // Filter out other declarations that are not overloads.  For example, an overloaded function can also
        // be a namespace.
        if (other.declaration.kind === astDeclaration.declaration.kind) {
          this._cachedOverloadIndexesByDeclaration.set(other, nextIndex);
          ++nextIndex;
        }
      }
      overloadIndex = this._cachedOverloadIndexesByDeclaration.get(astDeclaration);
    }

    if (overloadIndex === undefined) {
      // This should never happen
      throw new Error('Error calculating overload index for declaration');
    }

    return overloadIndex;
  }
}
