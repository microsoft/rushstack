// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* tslint:disable:no-bitwise */

import * as ts from 'typescript';
import { AstModuleVariable } from './AstModuleVariable';
import { AstItemKind, IAstItemOptions } from './AstItem';
import { IExportedSymbol } from './IExportedSymbol';
import { AstModule } from './AstModule';
import { TypeScriptHelpers } from '../utils/TypeScriptHelpers';

const allowedTypes: string[] = ['string', 'number', 'boolean'];

/**
  * This class is part of the AstItem abstract syntax tree. It represents exports of
  * a namespace, the exports can be module variable constants of type "string", "boolean" or "number".
  * An AstNamespace is defined using TypeScript's "namespace" keyword.
  *
  * @remarks A note about terminology:
  * - EcmaScript "namespace modules" are not conventional namespaces; their semantics are
  * more like static classes in C# or Java.
  * - API Extractor's support for namespaces is currently limited to representing tables of
  * constants, and has a benefit of enabling WebPack to avoid bundling unused values.
  * - We currently still recommend to use static classes for utility libraries, since this
  * provides getters/setters, public/private, and some other structure missing from namespaces.
  */
export class AstNamespace extends AstModule {
  private _exportedNormalizedSymbols: IExportedSymbol[] = [];

  constructor(options: IAstItemOptions) {
    super(options);
    this.kind = AstItemKind.Namespace;

    // NOTE: For this.name, we keep the default this.exportSymbol.name because when we used
    // options.declarationSymbol.name, this case was mishandled:
    //
    //  import { sub } from './sub'; export { sub };
    //
    // For details, see: https://github.com/Microsoft/web-build-tools/pull/773

    const exportSymbols: ts.Symbol[] = this.typeChecker.getExportsOfModule(this.declarationSymbol);
    if (exportSymbols) {
      if (this.context.policies.namespaceSupport === 'conservative') {
        this._processConservativeMembers(exportSymbols);
      } else {
        this._processPermissiveMembers(exportSymbols);
      }
    }
  }

  // Used when policies.namespaceSupport=conservative
  private _processConservativeMembers(exportSymbols: ts.Symbol[]): void {
    for (const exportSymbol of exportSymbols) {
      const followedSymbol: ts.Symbol = TypeScriptHelpers.followAliases(exportSymbol, this.typeChecker);

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
      const declarations: ts.Declaration[] | undefined = followedSymbol.getDeclarations();
      if (!declarations) {
        throw new Error('Missing declaration');
      }

      const declaration: ts.Declaration = declarations[0];

      if (declaration.parent && (declaration.parent.flags & ts.NodeFlags.Const) === 0) {
        this.reportWarning(`Export "${exportSymbol.name}" is missing the "const" ` +
          'modifier. Currently the "namespace" block only supports constant variables.');
        continue;
      }

      const propertySignature: ts.PropertySignature = declaration as ts.PropertySignature;

      if (!propertySignature.type) {
        this.reportWarning(`Export "${exportSymbol.name}" must specify a type`);
        continue;
      }

      // Note that we also allow type references that refer to one of the supported primitive types
      if (propertySignature.type.kind !== ts.SyntaxKind.TypeReference
        && allowedTypes.indexOf(propertySignature.type.getText()) < 0) {
        this.reportWarning(`Export "${exportSymbol.name}" must be of type` +
          ' "string", "number" or "boolean" when API Extractor is configured for conservative namespaces');
        continue;
      }

      // Typescript's VariableDeclaration AST nodes have an VariableDeclarationList parent,
      // and the VariableDeclarationList exists within a VariableStatement, which is where
      // the JSDoc comment Node can be found.
      // If there is no parent or grandparent of this VariableDeclaration then
      // we do not know how to obtain the JSDoc comment.
      if (!declaration.parent || !declaration.parent.parent ||
        declaration.parent.parent.kind !== ts.SyntaxKind.VariableStatement) {
        this.reportWarning(`Unable to locate the documentation node for "${exportSymbol.name}"; `
          + `this may be an API Extractor bug`);
      }

      const exportMemberOptions: IAstItemOptions = {
        context: this.context,
        declaration,
        declarationSymbol: followedSymbol,
        exportSymbol
      };

      this.addMemberItem(new AstModuleVariable(exportMemberOptions));

      this._exportedNormalizedSymbols.push({
        exportedName: exportSymbol.name,
        followedSymbol: followedSymbol
      });
    }
  }

  // Used when policies.namespaceSupport=permissive
  private _processPermissiveMembers(exportSymbols: ts.Symbol[]): void {
    for (const exportSymbol of exportSymbols) {
      this.processModuleExport(exportSymbol);
    }
  }
}
