// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* tslint:disable:no-bitwise */

import * as ts from 'typescript';
import { ExtractorContext } from '../ExtractorContext';
import { AstItemKind, IAstItemOptions } from './AstItem';
import { AstModule } from './AstModule';
import { TypeScriptHelpers } from '../utils/TypeScriptHelpers';
import { IExportedSymbol } from './IExportedSymbol';

/**
  * This class is part of the AstItem abstract syntax tree.  It represents the top-level
  * exports for an Rush package.  This object acts as the root of the Extractor's tree.
  */
export class AstPackage extends AstModule {
  private _exportedNormalizedSymbols: IExportedSymbol[] = [];

  private static _getOptions(context: ExtractorContext, rootFile: ts.SourceFile): IAstItemOptions {
    const rootFileSymbol: ts.Symbol | undefined = TypeScriptHelpers.tryGetSymbolForDeclaration(rootFile);

    if (!rootFileSymbol) {
      throw new Error('The entry point file does not appear to have any exports:\n' + rootFile.fileName
        + '\nNote that API Extractor does not yet support libraries consisting entirely of ambient types.');
    }

    if (!rootFileSymbol.declarations) {
      throw new Error('Unable to find a root declaration for this package');
    }

    // The @packagedocumentation comment is special because it is not attached to an AST
    // definition.  Instead, it is part of the "trivia" tokens that the compiler treats
    // as irrelevant white space.
    //
    // WARNING: If the comment doesn't precede an export statement, the compiler will omit
    // it from the *.d.ts file, and API Extractor won't find it.  If this happens, you need
    // to rearrange your statements to ensure it is passed through.
    //
    // This implementation assumes that the "@packagedocumentation" will be in the first JSDoc-comment
    // that appears in the entry point *.d.ts file.  We could possibly look in other places,
    // but the above warning suggests enforcing a standardized layout.  This design choice is open
    // to feedback.
    let packageCommentRange: ts.TextRange | undefined = undefined; // empty string

    for (const commentRange of ts.getLeadingCommentRanges(rootFile.text, rootFile.getFullStart()) || []) {
      if (commentRange.kind === ts.SyntaxKind.MultiLineCommentTrivia) {
        const commentBody: string = rootFile.text.substring(commentRange.pos, commentRange.end);

        // Choose the first JSDoc-style comment
        if (/^\s*\/\*\*/.test(commentBody)) {
          // But onliy if it looks like it's trying to be @packagedocumentation
          // (The ApiDocumentation parser will validate this more rigorously)
          if (commentBody.indexOf('@packagedocumentation') >= 0) {
            packageCommentRange = commentRange;
          }
          break;
        }
      }
    }

    if (!packageCommentRange) {
      // If we didn't find the @packagedocumentation tag in the expected place, is it in some
      // wrong place?  This sanity check helps people to figure out why there comment isn't working.
      for (const statement of rootFile.statements) {
        const ranges: ts.CommentRange[] = [];
        ranges.push(...ts.getLeadingCommentRanges(rootFile.text, statement.getFullStart()) || []);
        ranges.push(...ts.getTrailingCommentRanges(rootFile.text, statement.getEnd()) || []);

        for (const commentRange of ranges) {
          const commentBody: string = rootFile.text.substring(commentRange.pos, commentRange.end);

          if (commentBody.indexOf('@packagedocumentation') >= 0) {
            context.reportError('The @packagedocumentation comment must appear at the top of entry point *.d.ts file',
              rootFile, commentRange.pos);
          }
        }
      }
    }

    return {
      context,
      declaration: rootFileSymbol.declarations[0],
      declarationSymbol: rootFileSymbol,
      // NOTE: If there is no range, then provide an empty range to prevent ApiItem from
      // looking in the default place
      aedocCommentRange: packageCommentRange || { pos: 0, end: 0 }
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
