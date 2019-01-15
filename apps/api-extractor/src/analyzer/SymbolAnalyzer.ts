// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* tslint:disable:no-bitwise */

import * as ts from 'typescript';

import { TypeScriptHelpers } from './TypeScriptHelpers';

/**
 * This is a helper class for DtsRollupGenerator and AstSymbolTable.
 * Its main role is to provide an expanded version of TypeScriptHelpers.followAliases()
 * that supports tracking of imports from eternal packages.
 */
export class SymbolAnalyzer {

  /**
   * This function determines which ts.Node kinds will generate an AstDeclaration.
   * These correspond to the definitions that we can add AEDoc to.
   */
  public static isAstDeclaration(kind: ts.SyntaxKind): boolean {
    // (alphabetical order)
    switch (kind) {
      case ts.SyntaxKind.CallSignature:
      case ts.SyntaxKind.ClassDeclaration:
      case ts.SyntaxKind.ConstructSignature:    // Example: "new(x: number): IMyClass"
      case ts.SyntaxKind.Constructor:           // Example: "constructor(x: number)"
      case ts.SyntaxKind.EnumDeclaration:
      case ts.SyntaxKind.EnumMember:
      case ts.SyntaxKind.FunctionDeclaration:   // Example: "(x: number): number"
      case ts.SyntaxKind.IndexSignature:        // Example: "[key: string]: string"
      case ts.SyntaxKind.InterfaceDeclaration:
      case ts.SyntaxKind.MethodDeclaration:
      case ts.SyntaxKind.MethodSignature:
      case ts.SyntaxKind.ModuleDeclaration:     // Used for both "module" and "namespace" declarations
      case ts.SyntaxKind.PropertyDeclaration:
      case ts.SyntaxKind.PropertySignature:
      case ts.SyntaxKind.TypeAliasDeclaration:  // Example: "type Shape = Circle | Square"
      case ts.SyntaxKind.VariableDeclaration:
        return true;

      // NOTE: In contexts where a source file is treated as a module, we do create "nominal"
      // AstSymbol objects corresponding to a ts.SyntaxKind.SourceFile node.  However, a source file
      // is NOT considered a nesting structure, and it does NOT act as a root for the declarations
      // appearing in the file.  This is because the *.d.ts generator is in the business of rolling up
      // source files, and thus wants to ignore them in general.
    }

    return false;
  }

  public static isAmbient(symbol: ts.Symbol, typeChecker: ts.TypeChecker): boolean {
    const followedSymbol: ts.Symbol = TypeScriptHelpers.followAliases(symbol, typeChecker);

    if (followedSymbol.declarations && followedSymbol.declarations.length > 0) {
      const firstDeclaration: ts.Declaration = followedSymbol.declarations[0];

      // Test 1: Are we inside the sinister "declare global {" construct?
      const highestModuleDeclaration: ts.ModuleDeclaration | undefined
        = TypeScriptHelpers.findHighestParent(firstDeclaration, ts.SyntaxKind.ModuleDeclaration);
      if (highestModuleDeclaration) {
        if (highestModuleDeclaration.name.getText().trim() === 'global') {
          return true;
        }
      }

      // Test 2: Otherwise, the main heuristic for ambient declarations is by looking at the
      // ts.SyntaxKind.SourceFile node to see whether it has a symbol or not (i.e. whether it
      // is acting as a module or not).
      const sourceFileNode: ts.Node | undefined = TypeScriptHelpers.findFirstParent(
        firstDeclaration, ts.SyntaxKind.SourceFile);
      if (sourceFileNode && !!typeChecker.getSymbolAtLocation(sourceFileNode)) {
        return false;
      }
    }

    return true;
  }

  /*
  private static _followAliasesForExportDeclaration(declaration: ts.Declaration,
    symbol: ts.Symbol, typeChecker: ts.TypeChecker): IFollowAliasesResult | undefined {

    const exportDeclaration: ts.ExportDeclaration | undefined
      = TypeScriptHelpers.findFirstParent<ts.ExportDeclaration>(declaration, ts.SyntaxKind.ExportDeclaration);

    if (exportDeclaration) {
      let exportName: string;

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
        exportName = (exportSpecifier.propertyName || exportSpecifier.name).getText().trim();
      } else {
        throw new Error('Unimplemented export declaration kind: ' + declaration.getText());
      }

      if (exportDeclaration.moduleSpecifier) {
        const externalModulePath: string | undefined = SymbolAnalyzer._tryGetExternalModulePath(exportDeclaration);

        if (externalModulePath) {
          return {
            followedSymbol: TypeScriptHelpers.followAliases(symbol, typeChecker),
            localName: exportName,
            astImport: new AstImport({ modulePath: externalModulePath, exportName }),
            isAmbient: false
          };
        }
      }

    }

    return undefined;
  }

  private static _followAliasesForImportDeclaration(declaration: ts.Declaration,
    symbol: ts.Symbol, typeChecker: ts.TypeChecker): IFollowAliasesResult | undefined {

    const importDeclaration: ts.ImportDeclaration | undefined
      = TypeScriptHelpers.findFirstParent<ts.ImportDeclaration>(declaration, ts.SyntaxKind.ImportDeclaration);

    if (importDeclaration) {
      let exportName: string;

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
        exportName = (importSpecifier.propertyName || importSpecifier.name).getText().trim();
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
        exportName = '*';
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
        exportName = ts.InternalSymbolName.Default;
      } else {
        throw new Error('Unimplemented import declaration kind: ' + declaration.getText());
      }

      if (importDeclaration.moduleSpecifier) {
        const externalModulePath: string | undefined = SymbolAnalyzer._tryGetExternalModulePath(importDeclaration);
        if (externalModulePath) {
          return {
            followedSymbol: TypeScriptHelpers.followAliases(symbol, typeChecker),
            localName: symbol.name,
            astImport: new AstImport({ modulePath: externalModulePath, exportName }),
            isAmbient: false
          };
        }
      }

    }

    return undefined;
  }
*/

}
