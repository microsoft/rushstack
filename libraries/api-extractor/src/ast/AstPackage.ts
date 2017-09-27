// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* tslint:disable:no-bitwise */

import * as ts from 'typescript';
import Extractor from '../Extractor';
import AstStructuredType from './AstStructuredType';
import AstEnum from './AstEnum';
import AstFunction from './AstFunction';
import { AstItemKind, IAstItemOptions } from './AstItem';
import AstItemContainer from './AstItemContainer';
import AstNamespace from './AstNamespace';
import TypeScriptHelpers from '../TypeScriptHelpers';
import { IExportedSymbol } from './IExportedSymbol';

/**
  * This class is part of the AstItem abstract syntax tree.  It represents the top-level
  * exports for an Rush package.  This object acts as the root of the Extractor's tree.
  */
export default class AstPackage extends AstItemContainer {
  private _exportedNormalizedSymbols: IExportedSymbol[] = [];

  private static _getOptions(extractor: Extractor, rootFile: ts.SourceFile): IAstItemOptions {
    const rootFileSymbol: ts.Symbol = TypeScriptHelpers.getSymbolForDeclaration(rootFile);
    let statement: ts.VariableStatement;
    let foundDescription: ts.Node = undefined;

    for (const statementNode of rootFile.statements) {
      if (statementNode.kind === ts.SyntaxKind.VariableStatement) {
        statement = statementNode as ts.VariableStatement;
        for (const statementDeclaration of statement.declarationList.declarations) {
          if (statementDeclaration.name.getText() === 'packageDescription') {
            foundDescription = statement;
          }
        }
      }
    }

    return {
      extractor,
      declaration: rootFileSymbol.declarations[0],
      declarationSymbol: rootFileSymbol,
      jsdocNode: foundDescription
    };
  }

  constructor(extractor: Extractor, rootFile: ts.SourceFile) {
    super(AstPackage._getOptions(extractor, rootFile));
    this.kind = AstItemKind.Package;
    // The scoped package name. (E.g. "@microsoft/api-extractor")
    this.name = extractor.packageName;

    const exportSymbols: ts.Symbol[] = this.typeChecker.getExportsOfModule(this.declarationSymbol);
    if (exportSymbols) {
      for (const exportSymbol of exportSymbols) {
        const followedSymbol: ts.Symbol = this.followAliases(exportSymbol);

        if (!followedSymbol.declarations) {
          // This is an API Extractor bug, but it could happen e.g. if we upgrade to a new
          // version of the TypeScript compiler that introduces new AST variations that we
          // haven't tested before.
          this.reportWarning(`Definition with no declarations: ${exportSymbol.name}`);
          continue;
        }

        for (const declaration of followedSymbol.declarations) {
          const options: IAstItemOptions = {
            extractor: this.extractor,
            declaration,
            declarationSymbol: followedSymbol,
            jsdocNode: declaration,
            exportSymbol
          };

          if (followedSymbol.flags & (ts.SymbolFlags.Class | ts.SymbolFlags.Interface)) {
            this.addMemberItem(new AstStructuredType(options));
          } else if (followedSymbol.flags & ts.SymbolFlags.ValueModule) {
            this.addMemberItem(new AstNamespace(options));
          } else if (followedSymbol.flags & ts.SymbolFlags.Function) {
            this.addMemberItem(new AstFunction(options));
          } else if (followedSymbol.flags & ts.SymbolFlags.Enum) {
            this.addMemberItem(new AstEnum(options));
          } else {
            this.reportWarning(`Unsupported export: ${exportSymbol.name}`);
          }
        }
        this._exportedNormalizedSymbols.push({
          exportedName: exportSymbol.name,
          followedSymbol: followedSymbol
        });
      }
    }
  }

  /**
   * Finds and returns the original symbol name.
   *
   * For example, suppose a class is defined as "export default class MyClass { }"
   * but exported from the package's index.ts like this:
   *
   *    export { default as _MyClass } from './MyClass';
   *
   * In this example, given the symbol for _MyClass, getExportedSymbolName() will return
   * the string "MyClass".
   */
  public tryGetExportedSymbolName(symbol: ts.Symbol): string {
    const followedSymbol: ts.Symbol = this.followAliases(symbol);
    for (const exportedSymbol of this._exportedNormalizedSymbols) {
      if (exportedSymbol.followedSymbol === followedSymbol) {
        return exportedSymbol.exportedName;
      }
    }
    return undefined;
  }

  public shouldHaveDocumentation(): boolean {
    // We don't write JSDoc for the AstPackage object
    return false;
  }
}
