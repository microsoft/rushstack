// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as ts from 'typescript';
import { InternalError } from '@microsoft/node-core-library';

/**
 * Exposes the TypeScript compiler internals for detecting global variable names.
 */
export interface IGlobalVariableAnalyzer {
  hasGlobalName(name: string): boolean;
}

export class TypeScriptInternals {

  public static getImmediateAliasedSymbol(symbol: ts.Symbol, typeChecker: ts.TypeChecker): ts.Symbol {
    // Compiler internal:
    // https://github.com/microsoft/TypeScript/blob/v3.2.2/src/compiler/checker.ts
    return (typeChecker as any).getImmediateAliasedSymbol(symbol); // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  /**
   * Returns the Symbol for the provided Declaration.  This is a workaround for a missing
   * feature of the TypeScript Compiler API.   It is the only apparent way to reach
   * certain data structures, and seems to always work, but is not officially documented.
   *
   * @returns The associated Symbol.  If there is no semantic information (e.g. if the
   * declaration is an extra semicolon somewhere), then "undefined" is returned.
   */
  public static tryGetSymbolForDeclaration(declaration: ts.Declaration, checker: ts.TypeChecker): ts.Symbol
    | undefined {
    let symbol: ts.Symbol | undefined = (declaration as any).symbol;
    if (symbol && symbol.escapedName === ts.InternalSymbolName.Computed) {
      const name: ts.DeclarationName | undefined = ts.getNameOfDeclaration(declaration);
      symbol = name && checker.getSymbolAtLocation(name) || symbol;
    }
    return symbol;
  }

  /**
   * Returns whether the provided Symbol is a TypeScript "late-bound" Symbol (i.e. was created by the Checker
   * for a computed property based on its type, rather than by the Binder).
   */
  public static isLateBoundSymbol(symbol: ts.Symbol): boolean {
    // eslint-disable-next-line no-bitwise
    if (symbol.flags & ts.SymbolFlags.Transient &&
        (symbol as any).checkFlags === (ts as any).CheckFlags.Late) {
      return true;
    }
    return false;
  }

  /**
   * Retrieves the comment ranges associated with the specified node.
   */
  public static getJSDocCommentRanges(node: ts.Node, text: string): ts.CommentRange[] | undefined {
    // Compiler internal:
    // https://github.com/microsoft/TypeScript/blob/v2.4.2/src/compiler/utilities.ts#L616

    return (ts as any).getJSDocCommentRanges.apply(this, arguments);
  }

  /**
   * Retrieves the (unescaped) value of an string literal, numeric literal, or identifier.
   */
  public static getTextOfIdentifierOrLiteral(node: ts.Identifier | ts.StringLiteralLike | ts.NumericLiteral): string {
    // Compiler internal:
    // https://github.com/microsoft/TypeScript/blob/v3.2.2/src/compiler/utilities.ts#L2721

    return (ts as any).getTextOfIdentifierOrLiteral(node);
  }

  /**
   * Retrieves the (cached) module resolution information for a module name that was exported from a SourceFile.
   * The compiler populates this cache as part of analyzing the source file.
   */
  public static getResolvedModule(sourceFile: ts.SourceFile, moduleNameText: string): ts.ResolvedModuleFull
    | undefined {

    // Compiler internal:
    // https://github.com/microsoft/TypeScript/blob/v3.2.2/src/compiler/utilities.ts#L218

    return (ts as any).getResolvedModule(sourceFile, moduleNameText);
  }

  /**
   * Returns ts.Symbol.parent if it exists.
   */
  public static getSymbolParent(symbol: ts.Symbol): ts.Symbol | undefined {
    return (symbol as any).parent;
  }

  /**
   * In an statement like `export default class X { }`, the `Symbol.name` will be `default`
   * whereas the `localSymbol` is `X`.
   */
  public static tryGetLocalSymbol(declaration: ts.Declaration): ts.Symbol | undefined {
    return (declaration as any).localSymbol;
  }

  public static getGlobalVariableAnalyzer(program: ts.Program): IGlobalVariableAnalyzer {
    const anyProgram: any = program;
    if (!anyProgram.getDiagnosticsProducingTypeChecker) {
      throw new InternalError('Missing Program.getDiagnosticsProducingTypeChecker');
    }
    const typeChecker: any = anyProgram.getDiagnosticsProducingTypeChecker();
    if (!typeChecker.getEmitResolver) {
      throw new InternalError('Missing TypeChecker.getEmitResolver');
    }
    const resolver: any = typeChecker.getEmitResolver();
    if (!resolver.hasGlobalName) {
      throw new InternalError('Missing EmitResolver.hasGlobalName');
    }
    return resolver;
  }
}
