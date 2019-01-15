// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* tslint:disable:no-bitwise */

import * as ts from 'typescript';
import { TypeScriptMessageFormatter } from './TypeScriptMessageFormatter';

export class TypeScriptHelpers {
  /**
   * This traverses any symbol aliases to find the original place where an item was defined.
   * For example, suppose a class is defined as "export default class MyClass { }"
   * but exported from the package's index.ts like this:
   *
   *    export { default as _MyClass } from './MyClass';
   *
   * In this example, calling followAliases() on the _MyClass symbol will return the
   * original definition of MyClass, traversing any intermediary places where the
   * symbol was imported and re-exported.
   */
  public static followAliases(symbol: ts.Symbol, typeChecker: ts.TypeChecker): ts.Symbol {
    let current: ts.Symbol = symbol;
    while (true) { // tslint:disable-line:no-constant-condition
      if (!(current.flags & ts.SymbolFlags.Alias)) {
        break;
      }
      const currentAlias: ts.Symbol = typeChecker.getAliasedSymbol(current);
      if (!currentAlias || currentAlias === current) {
        break;
      }
      current = currentAlias;
    }

    return current;
  }

  public static getImmediateAliasedSymbol(symbol: ts.Symbol, typeChecker: ts.TypeChecker): ts.Symbol {
    return (typeChecker as any).getImmediateAliasedSymbol(symbol); // tslint:disable-line:no-any
  }

  /**
   * Returns the Symbol for the provided Declaration.  This is a workaround for a missing
   * feature of the TypeScript Compiler API.   It is the only apparent way to reach
   * certain data structures, and seems to always work, but is not officially documented.
   *
   * @returns The associated Symbol.  If there is no semantic information (e.g. if the
   * declaration is an extra semicolon somewhere), then "undefined" is returned.
   */
  public static tryGetSymbolForDeclaration(declaration: ts.Declaration): ts.Symbol | undefined {
    /* tslint:disable:no-any */
    const symbol: ts.Symbol = (declaration as any).symbol;
    /* tslint:enable:no-any */
    return symbol;
  }

  /**
   * Same semantics as tryGetSymbolForDeclaration(), but throws an exception if the symbol
   * cannot be found.
   */
  public static getSymbolForDeclaration(declaration: ts.Declaration): ts.Symbol {
    const symbol: ts.Symbol | undefined = TypeScriptHelpers.tryGetSymbolForDeclaration(declaration);
    if (!symbol) {
      throw new Error(TypeScriptMessageFormatter.formatFileAndLineNumber(declaration) + ': '
        + 'Unable to determine semantic information for this declaration');
    }
    return symbol;
  }

  // Return name of the module, which could be like "./SomeLocalFile' or like 'external-package/entry/point'
  public static getModuleSpecifier(declarationWithModuleSpecifier: ts.ImportDeclaration
    | ts.ExportDeclaration): string | undefined {

    if (declarationWithModuleSpecifier.moduleSpecifier
      && ts.isStringLiteralLike(declarationWithModuleSpecifier.moduleSpecifier)) {
      return TypeScriptHelpers.getTextOfIdentifierOrLiteral(declarationWithModuleSpecifier.moduleSpecifier);
    }

    return undefined;
  }

  /**
   * Retrieves the comment ranges associated with the specified node.
   */
  public static getJSDocCommentRanges(node: ts.Node, text: string): ts.CommentRange[] | undefined {
    // Compiler internal:
    // https://github.com/Microsoft/TypeScript/blob/v2.4.2/src/compiler/utilities.ts#L616

    // tslint:disable-next-line:no-any
    return (ts as any).getJSDocCommentRanges.apply(this, arguments);
  }

  /**
   * Retrieves the (unescaped) value of an string literal, numeric literal, or identifier.
   */
  public static getTextOfIdentifierOrLiteral(node: ts.Identifier | ts.StringLiteralLike | ts.NumericLiteral): string {
    // Compiler internal:
    // https://github.com/Microsoft/TypeScript/blob/v3.2.2/src/compiler/utilities.ts#L2721

    // tslint:disable-next-line:no-any
    return (ts as any).getTextOfIdentifierOrLiteral(node);
  }

  /**
   * Retrieves the (cached) module resolution information for a module name that was exported from a SourceFile.
   * The compiler populates this cache as part of analyzing the source file.
   */
  public static getResolvedModule(sourceFile: ts.SourceFile, moduleNameText: string): ts.ResolvedModuleFull
    | undefined {

    // Compiler internal:
    // https://github.com/Microsoft/TypeScript/blob/v3.2.2/src/compiler/utilities.ts#L218

    // tslint:disable-next-line:no-any
    return (ts as any).getResolvedModule(sourceFile, moduleNameText);
  }

  /**
   * Returns an ancestor of "node", such that the ancestor, any intermediary nodes,
   * and the starting node match a list of expected kinds.  Undefined is returned
   * if there aren't enough ancestors, or if the kinds are incorrect.
   *
   * For example, suppose child "C" has parents A --> B --> C.
   *
   * Calling _matchAncestor(C, [ExportSpecifier, NamedExports, ExportDeclaration])
   * would return A only if A is of kind ExportSpecifier, B is of kind NamedExports,
   * and C is of kind ExportDeclaration.
   *
   * Calling _matchAncestor(C, [ExportDeclaration]) would return C.
   */
  public static matchAncestor<T extends ts.Node>(node: ts.Node, kindsToMatch: ts.SyntaxKind[]): T | undefined {
    // (slice(0) clones an array)
    const reversedParentKinds: ts.SyntaxKind[] = kindsToMatch.slice(0).reverse();

    let current: ts.Node | undefined = undefined;

    for (const parentKind of reversedParentKinds) {
      if (!current) {
        // The first time through, start with node
        current = node;
      } else {
        // Then walk the parents
        current = current.parent;
      }

      // If we ran out of items, or if the kind doesn't match, then fail
      if (!current || current.kind !== parentKind) {
        return undefined;
      }
    }

    // If we matched everything, then return the node that matched the last parentKinds item
    return current as T;
  }

  /**
   * Does a depth-first search of the children of the specified node.  Returns the first child
   * with the specified kind, or undefined if there is no match.
   */
  public static findFirstChildNode<T extends ts.Node>(node: ts.Node, kindToMatch: ts.SyntaxKind): T | undefined {
    for (const child of node.getChildren()) {
      if (child.kind === kindToMatch) {
        return child as T;
      }

      const recursiveMatch: T | undefined = TypeScriptHelpers.findFirstChildNode(child, kindToMatch);
      if (recursiveMatch) {
        return recursiveMatch;
      }
    }

    return undefined;
  }

  /**
   * Returns the first parent node with the specified  SyntaxKind, or undefined if there is no match.
   */
  public static findFirstParent<T extends ts.Node>(node: ts.Node, kindToMatch: ts.SyntaxKind): T | undefined {
    let current: ts.Node | undefined = node.parent;

    while (current) {
      if (current.kind === kindToMatch) {
        return current as T;
      }
      current = current.parent;
    }

    return undefined;
  }

  /**
   * Returns the highest parent node with the specified SyntaxKind, or undefined if there is no match.
   * @remarks
   * Whereas findFirstParent() returns the first match, findHighestParent() returns the last match.
   */
  public static findHighestParent<T extends ts.Node>(node: ts.Node, kindToMatch: ts.SyntaxKind): T | undefined {
    let current: ts.Node | undefined = node;
    let highest: T | undefined = undefined;

    while (true) { // tslint:disable-line:no-constant-condition
      current = TypeScriptHelpers.findFirstParent<T>(current, kindToMatch);
      if (!current) {
        break;
      }
      highest = current as T;
    }

    return highest;
  }
}
