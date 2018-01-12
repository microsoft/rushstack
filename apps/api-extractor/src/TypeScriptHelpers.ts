// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* tslint:disable:no-bitwise */

import * as ts from 'typescript';
import PrettyPrinter from './PrettyPrinter';

export default class TypeScriptHelpers {
  /**
   * Splits on CRLF and other newline sequences
   */
  private static _newLineRegEx: RegExp = /\r\n|\n\r|\r|\n/g;

  /**
   * Start sequence is '/**'.
   */
  private static _jsdocStartRegEx: RegExp = /^\s*\/\*\*+\s*/;

  /**
   * End sequence is '*\/'.
   */
  private static _jsdocEndRegEx: RegExp = /\s*\*+\/\s*$/;

  /**
   * Intermediate lines of JSDoc comment character.
   */
  private static _jsdocIntermediateRegEx: RegExp = /^\s*\*\s?/;

  /**
   * Trailing white space
   */
  private static _jsdocTrimRightRegEx: RegExp = /\s*$/;

  /**
   * Invalid comment sequence
   */
  private static _jsdocCommentTerminator: RegExp = /[*][/]/g;

  /**
   * This traverses any type aliases to find the original place where an item was defined.
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
  public static tryGetSymbolForDeclaration(declaration: ts.Declaration): ts.Symbol {
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
    const symbol: ts.Symbol = TypeScriptHelpers.tryGetSymbolForDeclaration(declaration);
    if (!symbol) {
      PrettyPrinter.throwUnexpectedSyntaxError(declaration,
        'Unable to determine the semantic information for this declaration');
    }
    return symbol;
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
   * Similar to calling string.split() with a RegExp, except that the delimiters
   * are included in the result.
   *
   * Example: _splitStringWithRegEx("ABCDaFG", /A/gi) -> [ "A", "BCD", "a", "FG" ]
   * Example: _splitStringWithRegEx("", /A/gi) -> [ ]
   * Example: _splitStringWithRegEx("", /A?/gi) -> [ "" ]
   */
  public static splitStringWithRegEx(text: string, regExp: RegExp): string[] {
    if (!regExp.global) {
      throw new Error('RegExp must have the /g flag');
    }
    if (text === undefined) {
      return [];
    }

    const result: string[] = [];
    let index: number = 0;
    let match: RegExpExecArray | null;

    do {
      match = regExp.exec(text);
      if (match) {
        if (match.index > index) {
          result.push(text.substring(index, match.index));
        }
        const matchText: string = match[0];
        if (!matchText) {
          // It might be interesting to support matching e.g. '\b', but regExp.exec()
          // doesn't seem to iterate properly in this situation.
          throw new Error('The regular expression must match a nonzero number of characters');
        }
        result.push(matchText);
        index = regExp.lastIndex;
      }
    } while (match && regExp.global);

    if (index < text.length) {
      result.push(text.substr(index));
    }
    return result;
  }

  /**
   * Extracts the body of a JSDoc comment and returns it.
   */
  // Examples:
  // "/**\n * this is\n * a test\n */\n" --> "this is\na test\n"
  // "/** single line comment */" --> "single line comment"
  public static extractJSDocContent(text: string, errorLogger: (message: string) => void): string {
    // Remove any leading/trailing whitespace around the comment characters, then split on newlines
    const lines: string[] = text.trim().split(TypeScriptHelpers._newLineRegEx);
    if (lines.length === 0) {
      return '';
    }

    let matched: boolean;

    // Remove "/**" from the first line
    matched = false;
    lines[0] = lines[0].replace(TypeScriptHelpers._jsdocStartRegEx, () => {
      matched = true;
      return '';
    });
    if (!matched) {
      errorLogger('The comment does not begin with a \"/**\" delimiter.');
      return '';
    }

    // Remove "*/" from the last line
    matched = false;
    lines[lines.length - 1] = lines[lines.length - 1].replace(TypeScriptHelpers._jsdocEndRegEx, () => {
      matched = true;
      return '';
    });
    if (!matched) {
      errorLogger('The comment does not end with a \"*/\" delimiter.');
      return '';
    }

    // Remove a leading "*" from all lines except the first one
    for (let i: number = 1; i < lines.length; ++i) {
      lines[i] = lines[i].replace(TypeScriptHelpers._jsdocIntermediateRegEx, '');
    }

    // Remove trailing spaces from all lines
    for (let i: number = 0; i < lines.length; ++i) {
      lines[i] = lines[i].replace(TypeScriptHelpers._jsdocTrimRightRegEx, '');
    }

    // If the first line is blank, then remove it
    if (lines[0] === '') {
      lines.shift();
    }

    return lines.join('\n');
  }

  /**
   * Returns a JSDoc comment containing the provided content.
   *
   * @remarks
   * This is the inverse of the extractJSDocContent() operation.
   */
  // Examples:
  // "this is\na test\n" --> "/**\n * this is\n * a test\n */\n"
  // "single line comment" --> "/** single line comment */"
  public static formatJSDocContent(content: string): string {
    if (!content) {
      return '';
    }

    // If the string contains "*/", then replace it with "*\/"
    const escapedContent: string = content.replace(TypeScriptHelpers._jsdocCommentTerminator, '*\\/');

    const lines: string[] = escapedContent.split(TypeScriptHelpers._newLineRegEx);
    if (lines.length === 0) {
      return '';
    }

    if (lines.length < 2) {
      return `/** ${escapedContent} */`;
    } else {
      // If there was a trailing newline, remove it
      if (lines[lines.length - 1] === '') {
        lines.pop();
      }

      return '/**\n * '
        + lines.join('\n * ')
        + '\n */';
    }
  }
}
