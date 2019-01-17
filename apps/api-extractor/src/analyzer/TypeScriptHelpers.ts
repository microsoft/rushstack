// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* tslint:disable:no-bitwise */

import * as ts from 'typescript';
import { TypeScriptMessageFormatter } from './TypeScriptMessageFormatter';
import { TypeScriptInternals } from './TypeScriptInternals';

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

  /**
   * Returns true if the specified symbol is an ambient declaration.
   */
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
      const sourceFile: ts.SourceFile = firstDeclaration.getSourceFile();

      if (!!typeChecker.getSymbolAtLocation(sourceFile)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Same semantics as tryGetSymbolForDeclaration(), but throws an exception if the symbol
   * cannot be found.
   */
  public static getSymbolForDeclaration(declaration: ts.Declaration): ts.Symbol {
    const symbol: ts.Symbol | undefined = TypeScriptInternals.tryGetSymbolForDeclaration(declaration);
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
      return TypeScriptInternals.getTextOfIdentifierOrLiteral(declarationWithModuleSpecifier.moduleSpecifier);
    }

    return undefined;
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
