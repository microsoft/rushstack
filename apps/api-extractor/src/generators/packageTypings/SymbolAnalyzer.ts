// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* tslint:disable:no-bitwise */

import * as ts from 'typescript';

import { TypeScriptHelpers } from '../../utils/TypeScriptHelpers';

/**
 * Return value for PackageTypingsGenerator._followAliases()
 */
export interface IFollowAliasesResult {
  /**
   * The original symbol that defined this entry, after following any aliases.
   */
  followedSymbol: ts.Symbol;

  /**
   * The original name used where it was defined.
   */
  localName: string;

  /**
   * True if this is an ambient definition, e.g. from a "typings" folder.
   */
  isAmbient: boolean;

  /** {@inheritdoc Entry.importPackagePath} */
  importPackagePath: string | undefined;

  /** {@inheritdoc Entry.importPackageExportName} */
  importPackageExportName: string | undefined;
}

export class SymbolAnalyzer {
  /**
   * For the given symbol, follow imports and type alias to find the symbol that represents
   * the original definition.
   */
  public static followAliases(symbol: ts.Symbol, typeChecker: ts.TypeChecker): IFollowAliasesResult {
    let current: ts.Symbol = symbol;

    // Is it ambient?  We will examine all of the declarations we encounter
    // to see if any of them contains the "export" keyword; if not, then it's ambient.
    let isAmbient: boolean = true;

    // We will try to obtain the name from a declaration; otherwise we'll fall back to the symbol name
    let declarationName: string | undefined = undefined;

    while (true) { // tslint:disable-line:no-constant-condition
      for (const declaration of current.declarations || []) {
        // 1. Check for any signs that this is not an ambient definition
        if (declaration.kind === ts.SyntaxKind.ExportSpecifier
          || declaration.kind === ts.SyntaxKind.ExportAssignment) {
          isAmbient = false;
        }

        const modifiers: ts.ModifierFlags = ts.getCombinedModifierFlags(declaration);
        if (modifiers & (ts.ModifierFlags.Export | ts.ModifierFlags.ExportDefault)) {
          isAmbient = false;
        }

        const declarationNameIdentifier: ts.DeclarationName | undefined = ts.getNameOfDeclaration(declaration);
        if (declarationNameIdentifier && ts.isIdentifier(declarationNameIdentifier)) {
          declarationName = declarationNameIdentifier.getText().trim();
        }

        // 2. Check for any signs that this was imported from an external package
        let result: IFollowAliasesResult | undefined;

        result = SymbolAnalyzer._followAliasesForExportDeclaration(declaration, current);
        if (result) {
          return result;
        }

        result = SymbolAnalyzer._followAliasesForImportDeclaration(declaration, current);
        if (result) {
          return result;
        }
      }

      if (!(current.flags & ts.SymbolFlags.Alias)) {
        break;
      }

      const currentAlias: ts.Symbol = TypeScriptHelpers.getImmediateAliasedSymbol(current, typeChecker);
      // Stop if we reach the end of the chain
      if (!currentAlias || currentAlias === current) {
        break;
      }

      current = currentAlias;
    }

    return {
      followedSymbol: current,
      localName: declarationName || current.name,
      importPackagePath: undefined,
      importPackageExportName: undefined,
      isAmbient: isAmbient
    };
  }

  /**
   * Helper function for _followAliases(), for handling ts.ExportDeclaration patterns
   */
  private static _followAliasesForExportDeclaration(declaration: ts.Declaration,
    symbol: ts.Symbol): IFollowAliasesResult | undefined {

    const exportDeclaration: ts.ExportDeclaration | undefined
      = TypeScriptHelpers.findFirstParent<ts.ExportDeclaration>(declaration, ts.SyntaxKind.ExportDeclaration);

    if (exportDeclaration) {
      let importPackageExportName: string;

      if (declaration.kind === ts.SyntaxKind.ExportSpecifier) {
        // EXAMPLE:
        // "export { A } from './file-a';"
        //
        // ExportDeclaration:
        //   ExportKeyword:  pre=[export] sep=[ ]
        //   NamedExports:
        //     FirstPunctuation:  pre=[{] sep=[ ]
        //     SyntaxList:
        //       ExportSpecifier:  <------------- declaration
        //         Identifier:  pre=[A] sep=[ ]
        //     CloseBraceToken:  pre=[}] sep=[ ]
        //   FromKeyword:  pre=[from] sep=[ ]
        //   StringLiteral:  pre=['./file-a']
        //   SemicolonToken:  pre=[;]

        // Example: " ExportName as RenamedName"
        const exportSpecifier: ts.ExportSpecifier = declaration as ts.ExportSpecifier;
        importPackageExportName = (exportSpecifier.propertyName || exportSpecifier.name).getText().trim();
      } else {
        throw new Error('Unimplemented export declaration kind: ' + declaration.getText());
      }

      if (exportDeclaration.moduleSpecifier) {
        // Examples:
        //    " '@microsoft/sp-lodash-subset'"
        //    " "lodash/has""
        const packagePath: string | undefined = SymbolAnalyzer._getPackagePathFromModuleSpecifier(
          exportDeclaration.moduleSpecifier);

        if (packagePath) {
          return {
            followedSymbol: symbol,
            localName: importPackageExportName,
            importPackagePath: packagePath,
            importPackageExportName: importPackageExportName,
            isAmbient: false
          };
        }
      }

    }

    return undefined;
  }

  /**
   * Helper function for _followAliases(), for handling ts.ImportDeclaration patterns
   */
  private static _followAliasesForImportDeclaration(declaration: ts.Declaration,
    symbol: ts.Symbol): IFollowAliasesResult | undefined {

    const importDeclaration: ts.ImportDeclaration | undefined
      = TypeScriptHelpers.findFirstParent<ts.ImportDeclaration>(declaration, ts.SyntaxKind.ImportDeclaration);

    if (importDeclaration) {
      let importPackageExportName: string;

      if (declaration.kind === ts.SyntaxKind.ImportSpecifier) {
        // EXAMPLE:
        // "import { A, B } from 'the-lib';"
        //
        // ImportDeclaration:
        //   ImportKeyword:  pre=[import] sep=[ ]
        //   ImportClause:
        //     NamedImports:
        //       FirstPunctuation:  pre=[{] sep=[ ]
        //       SyntaxList:
        //         ImportSpecifier:  <------------- declaration
        //           Identifier:  pre=[A]
        //         CommaToken:  pre=[,] sep=[ ]
        //         ImportSpecifier:
        //           Identifier:  pre=[B] sep=[ ]
        //       CloseBraceToken:  pre=[}] sep=[ ]
        //   FromKeyword:  pre=[from] sep=[ ]
        //   StringLiteral:  pre=['the-lib']
        //   SemicolonToken:  pre=[;]

        // Example: " ExportName as RenamedName"
        const importSpecifier: ts.ImportSpecifier = declaration as ts.ImportSpecifier;
        importPackageExportName = (importSpecifier.propertyName || importSpecifier.name).getText().trim();
      } else if (declaration.kind === ts.SyntaxKind.NamespaceImport) {
        // EXAMPLE:
        // "import * as theLib from 'the-lib';"
        //
        // ImportDeclaration:
        //   ImportKeyword:  pre=[import] sep=[ ]
        //   ImportClause:
        //     NamespaceImport:  <------------- declaration
        //       AsteriskToken:  pre=[*] sep=[ ]
        //       AsKeyword:  pre=[as] sep=[ ]
        //       Identifier:  pre=[theLib] sep=[ ]
        //   FromKeyword:  pre=[from] sep=[ ]
        //   StringLiteral:  pre=['the-lib']
        //   SemicolonToken:  pre=[;]
        importPackageExportName = '*';
      } else if (declaration.kind === ts.SyntaxKind.ImportClause) {
        // EXAMPLE:
        // "import A, { B } from './A';"
        //
        // ImportDeclaration:
        //   ImportKeyword:  pre=[import] sep=[ ]
        //   ImportClause:  <------------- declaration (referring to A)
        //     Identifier:  pre=[A]
        //     CommaToken:  pre=[,] sep=[ ]
        //     NamedImports:
        //       FirstPunctuation:  pre=[{] sep=[ ]
        //       SyntaxList:
        //         ImportSpecifier:
        //           Identifier:  pre=[B] sep=[ ]
        //       CloseBraceToken:  pre=[}] sep=[ ]
        //   FromKeyword:  pre=[from] sep=[ ]
        //   StringLiteral:  pre=['./A']
        //   SemicolonToken:  pre=[;]
        importPackageExportName = 'default';
      } else {
        throw new Error('Unimplemented import declaration kind: ' + declaration.getText());
      }

      if (importDeclaration.moduleSpecifier) {
        // Examples:
        //    " '@microsoft/sp-lodash-subset'"
        //    " "lodash/has""
        const packagePath: string | undefined = SymbolAnalyzer._getPackagePathFromModuleSpecifier(
          importDeclaration.moduleSpecifier);

        if (packagePath) {
          return {
            followedSymbol: symbol,
            localName: symbol.name,
            importPackagePath: packagePath,
            importPackageExportName: importPackageExportName,
            isAmbient: false
          };
        }
      }

    }

    return undefined;
  }

  private static _getPackagePathFromModuleSpecifier(moduleSpecifier: ts.Expression): string | undefined {
    // Examples:
    //    " '@microsoft/sp-lodash-subset'"
    //    " "lodash/has""
    //    " './MyClass'"
    const moduleSpecifierText: string = moduleSpecifier.getFullText();

    // Remove quotes/whitespace
    const path: string = moduleSpecifierText
      .replace(/^\s*['"]/, '')
      .replace(/['"]\s*$/, '');

    // Does it start with something like "./" or "../"?
    // If not, then assume it's an import from an external package
    if (!/^\.\.?\//.test(path)) {
      return path;
    }

    return undefined;
  }
}
