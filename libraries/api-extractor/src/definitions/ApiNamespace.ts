// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* tslint:disable:no-bitwise */

import * as ts from 'typescript';
import ApiModuleVariable from './ApiModuleVariable';
import ApiItem, { ApiItemKind, IApiItemOptions } from './ApiItem';
import ApiItemContainer from './ApiItemContainer';
import { IExportedSymbol } from '../IExportedSymbol';
const allowedTypes: string[] = ['string', 'number', 'boolean'];

/**
  * This class is part of the ApiItem abstract syntax tree. It represents exports of
  * a namespace, the exports can be module variable constants of type "string", "boolean" or "number".
  * An ApiNamespace is defined using TypeScript's "namespace" keyword.
  *
  * @remarks A note about terminology:
  * - EcmaScript "namespace modules" are not conventional namespaces; their semantics are
  * more like static classes in C# or Java.
  * - API Extractor's support for namespaces is currently limited to representing tables of
  * constants, and has a benefit of enabling WebPack to avoid bundling unused values.
  * - We currently still recommend to use static classes for utility libraries, since this
  * provides getters/setters, public/private, and some other structure missing from namespaces.
  */
export default class ApiNamespace extends ApiItemContainer {
  private _exportedNormalizedSymbols: IExportedSymbol[] = [];

  constructor(options: IApiItemOptions) {
    super(options);
    this.kind = ApiItemKind.Namespace;
    this.name = options.declarationSymbol.name;

    const exportSymbols: ts.Symbol[] = this.typeChecker.getExportsOfModule(this.declarationSymbol);
    if (exportSymbols) {
      for (const exportSymbol of exportSymbols) {
        const followedSymbol: ts.Symbol = this.followAliases(exportSymbol);

        if (!followedSymbol.declarations) {
          // This is an API Extractor bug, but it could happen e.g. if we upgrade to a new
          // version of the TypeScript compiler that introduces new AST variations that we
          // haven't tested before.
          this.reportWarning(`The definition "${exportSymbol.name}" has no declarations`);
          continue;
        }

        if (!(followedSymbol.flags === ts.SymbolFlags.BlockScopedVariable)) {
          this.reportWarning(`Unsupported export "${exportSymbol.name}" ` +
            'Currently the "namespace" block only supports constant variables.');
          continue;
        }

        // Since we are imposing that the items within a namespace be
        // const properties we are only taking the first declaration.
        // If we decide to add support for other types within a namespace
        // we will have for evaluate each declaration.
        const declaration: ts.Declaration = followedSymbol.getDeclarations()[0];

        if (declaration.parent.flags !== ts.NodeFlags.Const) {
          this.reportWarning(`Export "${exportSymbol.name}" is missing the "const" ` +
            'modifier. Currently the "namespace" block only supports constant variables.');
          continue;
        }

        const propertySignature: ts.PropertySignature = declaration as ts.PropertySignature;
        if (!propertySignature.type || allowedTypes.indexOf(propertySignature.type.getText()) < 0) {
          this.reportWarning(`Export "${exportSymbol.name}" must specify and be of type` +
            '"string", "number" or "boolean"');
          continue;
        }

        if (!propertySignature.initializer) {
          this.reportWarning(`Export "${exportSymbol.name}" must have an initialized value`);
          continue;
        }

        // Typescript's VariableDeclaration AST nodes have an VariableDeclarationList parent,
        // and the VariableDeclarationList exists within a VariableStatement, which is where
        // the JSDoc comment Node can be found.
        // If there is no parent or grandparent of this VariableDeclartion then
        // we do not know how to obtain the JSDoc comment.
        let jsdocNode: ts.Node;
        if (!declaration.parent || !declaration.parent.parent ||
          declaration.parent.parent.kind !== ts.SyntaxKind.VariableStatement) {
          this.reportWarning(`Unable to locate the documentation node for "${exportSymbol.name}"; `
            + `this may be an API Extractor bug`);
        } else {
          jsdocNode = declaration.parent.parent;
        }

        const exportMemberOptions: IApiItemOptions = {
          extractor: this.extractor,
          declaration,
          declarationSymbol: followedSymbol,
          jsdocNode: jsdocNode,
          exportSymbol
        };

        this.addMemberItem(new ApiModuleVariable(exportMemberOptions));

        this._exportedNormalizedSymbols.push({
          exportedName: exportSymbol.name,
          followedSymbol: followedSymbol
        });
      }
    }
  }
}
