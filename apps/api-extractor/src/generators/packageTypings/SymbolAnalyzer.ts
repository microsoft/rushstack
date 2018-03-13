// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* tslint:disable:no-bitwise */

import * as ts from 'typescript';

import { TypeScriptHelpers } from '../../utils/TypeScriptHelpers';
import { AstImport } from './AstImport';

/**
 * Return value for PackageTypingsGenerator._followAliases()
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
 * This is a helper class for PackageTypingsAnalyzer and SymbolTable.
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
      case ts.SyntaxKind.ClassDeclaration:
      case ts.SyntaxKind.EnumDeclaration:
      case ts.SyntaxKind.EnumMember:
      case ts.SyntaxKind.FunctionDeclaration:
      case ts.SyntaxKind.InterfaceDeclaration:
      case ts.SyntaxKind.MethodDeclaration:
      case ts.SyntaxKind.MethodSignature:

      // ModuleDeclaration is used for both "module" and "namespace" declarations
      case ts.SyntaxKind.ModuleDeclaration:
      case ts.SyntaxKind.PropertyDeclaration:
      case ts.SyntaxKind.PropertySignature:

      // SourceFile is used for "import * as file from 'file';"
      case ts.SyntaxKind.SourceFile:
      case ts.SyntaxKind.TypeAliasDeclaration:
      case ts.SyntaxKind.VariableDeclaration:
        return true;
    }
    return false;
  }

  /**
   * This function detects the subset of isAstDeclaration() items that can use
   * the "export" keyword.  This is part of the heuristic for recognizing ambient types.
   */
  public static isExportableAstDeclaration(kind: ts.SyntaxKind): boolean {
    // (alphabetical order)
    switch (kind) {
      case ts.SyntaxKind.ClassDeclaration:
      case ts.SyntaxKind.EnumDeclaration:
      case ts.SyntaxKind.FunctionDeclaration:
      case ts.SyntaxKind.InterfaceDeclaration:
      case ts.SyntaxKind.ModuleDeclaration:
      case ts.SyntaxKind.TypeAliasDeclaration:
      case ts.SyntaxKind.VariableDeclaration:
      return true;
    }
    return false;
  }

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

    // Is the followedSymbol actually the kind of thing that can be ambient?
    if (isAmbient) {
      for (const declaration of current.declarations || []) {
        // These actually need "export" keywords
        if (!SymbolAnalyzer.isExportableAstDeclaration(declaration.kind)) {
          // Everything else we assume is some kind of nested declaration that
          // doesn't need it.
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
        // Examples:
        //    " '@microsoft/sp-lodash-subset'"
        //    " "lodash/has""
        const modulePath: string | undefined = SymbolAnalyzer._getPackagePathFromModuleSpecifier(
          exportDeclaration.moduleSpecifier);

        if (modulePath) {
          return {
            followedSymbol: TypeScriptHelpers.followAliases(symbol, typeChecker),
            localName: exportName,
            astImport: new AstImport({ modulePath, exportName }),
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
        exportName = 'default';
      } else {
        throw new Error('Unimplemented import declaration kind: ' + declaration.getText());
      }

      if (importDeclaration.moduleSpecifier) {
        // Examples:
        //    " '@microsoft/sp-lodash-subset'"
        //    " "lodash/has""
        const modulePath: string | undefined = SymbolAnalyzer._getPackagePathFromModuleSpecifier(
          importDeclaration.moduleSpecifier);

        if (modulePath) {
          return {
            followedSymbol: TypeScriptHelpers.followAliases(symbol, typeChecker),
            localName: symbol.name,
            astImport: new AstImport({ modulePath, exportName }),
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
