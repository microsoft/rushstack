// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import { ExtractorContext } from '../analyzer/ExtractorContext';
import { AstSymbolTable } from '../analyzer/AstSymbolTable';
import { AstEntryPoint } from '../analyzer/AstEntryPoint';
import { ApiModel } from '../api/model/ApiModel';
import { AstDeclaration } from '../analyzer/AstDeclaration';
import { ApiItem, IApiItemParameters } from '../api/model/ApiItem';
import { ApiClass } from '../api/model/ApiClass';
import { ApiPackage } from '../api/model/ApiPackage';
import { ApiEntryPoint } from '../api/model/ApiEntryPoint';
import { ApiMethod } from '../api/model/ApiMethod';
import { ApiNamespace } from '../api/model/ApiNamespace';
import { AstSymbol } from '../analyzer/AstSymbol';
import { ApiItemContainer } from '../api/model/Mixins';

export class ModelBuilder {
  private readonly _context: ExtractorContext;
  private readonly _astSymbolTable: AstSymbolTable;
  private _astEntryPoint: AstEntryPoint | undefined;
  private _apiModel: ApiModel;
  private _apiItemsBySymbol: Map<AstSymbol, ApiItem>;

  public constructor(context: ExtractorContext) {
    this._context = context;
    this._astSymbolTable = new AstSymbolTable(this._context.typeChecker, this._context.packageJsonLookup);
    this._apiModel = new ApiModel();
    this._apiItemsBySymbol = new Map<AstSymbol, ApiItem>();
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

    debugger;
  }

  public _processDeclaration(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainer): void {

    const apiItem: ApiItem | undefined = this._apiItemsBySymbol.get(astDeclaration.astSymbol);

    switch (astDeclaration.declaration.kind) {
      case ts.SyntaxKind.ClassDeclaration:
        this._processApiClass(astDeclaration, exportedName, parentApiItem, apiItem as ApiClass);
        break;

      case ts.SyntaxKind.MethodDeclaration:
        this._processApiMethod(astDeclaration, exportedName, parentApiItem, apiItem as ApiMethod);
        break;

      case ts.SyntaxKind.ModuleDeclaration:
        this._processApiNamespace(astDeclaration, exportedName, parentApiItem, apiItem as ApiNamespace);
        break;

      case ts.SyntaxKind.MethodSignature:
      case ts.SyntaxKind.Constructor:
      case ts.SyntaxKind.ConstructSignature:
      case ts.SyntaxKind.EnumDeclaration:
      case ts.SyntaxKind.EnumMember:
      case ts.SyntaxKind.FunctionDeclaration:
      case ts.SyntaxKind.IndexSignature:
      case ts.SyntaxKind.InterfaceDeclaration:
      case ts.SyntaxKind.PropertyDeclaration:
      case ts.SyntaxKind.PropertySignature:
      case ts.SyntaxKind.TypeAliasDeclaration:
      case ts.SyntaxKind.VariableDeclaration:
      default:
    }
  }

  private _processChildDeclarations(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainer): void {
    for (const childDeclaration of astDeclaration.children) {
      this._processDeclaration(childDeclaration, undefined, parentApiItem);
    }
  }

  private _processApiClass(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainer, apiItem: ApiClass | undefined): void {

    if (apiItem === undefined) {
      apiItem = new ApiClass(this._createApiItemParameters(astDeclaration, exportedName));
      parentApiItem.addMember(apiItem);
    }

    this._processChildDeclarations(astDeclaration, exportedName, apiItem);
  }

  private _processApiMethod(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainer, apiItem: ApiMethod | undefined): void {

    if (apiItem === undefined) {
      apiItem = new ApiMethod(this._createApiItemParameters(astDeclaration, exportedName));
      parentApiItem.addMember(apiItem);
    }
  }

  private _processApiNamespace(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainer, apiItem: ApiNamespace | undefined): void {

    if (apiItem === undefined) {
      apiItem = new ApiNamespace(this._createApiItemParameters(astDeclaration, exportedName));
      parentApiItem.addMember(apiItem);
    }

    this._processChildDeclarations(astDeclaration, exportedName, apiItem);
  }

  private _createApiItemParameters(astDeclaration: AstDeclaration,
    exportedName: string | undefined): IApiItemParameters {

    let name: string | undefined = exportedName;
    if (!name) {
      name = astDeclaration.astSymbol.localName;
    }

    return { name };
  }

}
