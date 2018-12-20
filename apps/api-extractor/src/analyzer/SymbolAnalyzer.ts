// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* tslint:disable:no-bitwise */

import * as ts from 'typescript';

import { TypeScriptHelpers } from './TypeScriptHelpers';
import { AstImport } from './AstImport';

/**
 * Return value for DtsRollupGenerator._followAliases()
 */
export interface IFollowAliasesResult {
  /**
   * The original symbol that defined this entry, after following any aliases.
   */
  readonly followedSymbol: ts.Symbol;

  /**
   * The original name used where it was defined.
   */
  readonly localName: string;

  /**
   * True if this is an ambient definition, e.g. from a "typings" folder.
   */
  readonly isAmbient: boolean;

  /**
   * If this followedSymbol was reached by traversing
   */
  readonly astImport: AstImport | undefined;
}

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

  /**
   * For the given symbol, follow imports and type alias to find the symbol that represents
   * the original definition.
   */
  public static followAliases(symbol: ts.Symbol, typeChecker: ts.TypeChecker): IFollowAliasesResult {
    let current: ts.Symbol = symbol;

    // We will try to obtain the name from a declaration; otherwise we'll fall back to the symbol name
    let declarationName: string | undefined = undefined;

    while (true) { // tslint:disable-line:no-constant-condition
      for (const declaration of current.declarations || []) {
        const declarationNameIdentifier: ts.DeclarationName | undefined = ts.getNameOfDeclaration(declaration);
        if (declarationNameIdentifier && ts.isIdentifier(declarationNameIdentifier)) {
          declarationName = declarationNameIdentifier.getText().trim();
        }

        // 2. Check for any signs that this was imported from an external package
        let result: IFollowAliasesResult | undefined;

        result = SymbolAnalyzer._followAliasesForExportDeclaration(declaration, current, typeChecker);
        if (result) {
          return result;
        }

        result = SymbolAnalyzer._followAliasesForImportDeclaration(declaration, current, typeChecker);
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

    // Is this an ambient declaration?
    let isAmbient: boolean = true;
    if (current.declarations) {

      // Test 1: Are we inside the sinister "declare global {" construct?
      let insideDeclareGlobal: boolean = false;
      const highestModuleDeclaration: ts.ModuleDeclaration | undefined
        = TypeScriptHelpers.findHighestParent(current.declarations[0], ts.SyntaxKind.ModuleDeclaration);
      if (highestModuleDeclaration) {
        if (highestModuleDeclaration.name.getText().trim() === 'global') {
          insideDeclareGlobal = true;
        }
      }

      // Test 2: Otherwise, the main heuristic for ambient declarations is by looking at the
      // ts.SyntaxKind.SourceFile node to see whether it has a symbol or not (i.e. whether it
      // is acting as a module or not).
      if (!insideDeclareGlobal) {
        const sourceFileNode: ts.Node | undefined = TypeScriptHelpers.findFirstParent(
          current.declarations[0], ts.SyntaxKind.SourceFile);
        if (sourceFileNode && !!typeChecker.getSymbolAtLocation(sourceFileNode)) {
          isAmbient = false;
        }
      }
    }

    return {
      followedSymbol: current,
      localName: declarationName || current.name,
      astImport: undefined,
      isAmbient: isAmbient
    };
  }

  /**
   * Helper function for _followAliases(), for handling ts.ExportDeclaration patterns
   */
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

  /**
   * Helper function for _followAliases(), for handling ts.ImportDeclaration patterns
   */
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

  private static _tryGetExternalModulePath(declarationWithModuleSpecifier: ts.ImportDeclaration
    | ts.ExportDeclaration): string | undefined {

    const moduleSpecifier: string | undefined = TypeScriptHelpers.getModuleSpecifier(declarationWithModuleSpecifier);

    // Match:       "@microsoft/sp-lodash-subset" or "lodash/has"
    // but ignore:  "../folder/LocalFile"
    if (moduleSpecifier && !ts.isExternalModuleNameRelative(moduleSpecifier)) {
      return moduleSpecifier;
    }

    return undefined;
  }
}
