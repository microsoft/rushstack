// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* tslint:disable:no-bitwise */

import * as ts from 'typescript';
import { ExtractorContext } from '../ExtractorContext';
import { AstItemKind, IAstItemOptions } from './AstItem';
import AstModule from './AstModule';
import TypeScriptHelpers from '../TypeScriptHelpers';
import { IExportedSymbol } from './IExportedSymbol';

/**
  * This class is part of the AstItem abstract syntax tree.  It represents the top-level
  * exports for an Rush package.  This object acts as the root of the Extractor's tree.
  */
export default class AstPackage extends AstModule {
  private _exportedNormalizedSymbols: IExportedSymbol[] = [];

  private static _getOptions(context: ExtractorContext, rootFile: ts.SourceFile): IAstItemOptions {
    const rootFileSymbol: ts.Symbol = TypeScriptHelpers.getSymbolForDeclaration(rootFile);
    let statement: ts.VariableStatement;
    let foundDescription: ts.Node | undefined = undefined;

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

    if (!rootFileSymbol.declarations) {
      throw new Error('Unable to find a root declaration for this package');
    }

    return {
      context,
      declaration: rootFileSymbol.declarations[0],
      declarationSymbol: rootFileSymbol,
      jsdocNode: foundDescription
    };
  }

  constructor(context: ExtractorContext, rootFile: ts.SourceFile) {
    super(AstPackage._getOptions(context, rootFile));
    this.kind = AstItemKind.Package;
    // The scoped package name. (E.g. "@microsoft/api-extractor")
    this.name = context.packageName;

    const exportSymbols: ts.Symbol[] = this.typeChecker.getExportsOfModule(this.declarationSymbol) || [];

    for (const exportSymbol of exportSymbols) {
        this.processModuleExport(exportSymbol);

        const followedSymbol: ts.Symbol = TypeScriptHelpers.followAliases(exportSymbol, this.typeChecker);
      this._exportedNormalizedSymbols.push({
        exportedName: exportSymbol.name,
        followedSymbol: followedSymbol
      });
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
  public tryGetExportedSymbolName(symbol: ts.Symbol): string | undefined {
    const followedSymbol: ts.Symbol = TypeScriptHelpers.followAliases(symbol, this.typeChecker);
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
