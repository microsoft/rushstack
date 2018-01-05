// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* tslint:disable:no-bitwise */

import * as ts from 'typescript';
import PrettyPrinter from './PrettyPrinter';

export default class TypeScriptHelpers {

  /**
   * Splits by the characters '\r\n'.
   */
  public static newLineRegEx: RegExp = /\r\n|\n/g;

  /**
   * Start sequence is '/**'.
   */
  public static jsdocStartRegEx: RegExp = /^\s*\/\*\*\s?/g;

  /**
   * End sequence is '*\/'.
   */
  public static jsdocEndRegEx: RegExp = /\s*\*\/\s*$/g;

  /**
   * Intermediate lines of JSDoc comment character.
   */
  public static jsdocIntermediateRegEx: RegExp = /^\s*[*]\s?/g;

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
  // "/**\n * this is\n * a test\n */\n" --> "this is\na test"
  // "/** single line comment */" --> "single line comment"
  public static extractJSDocContent(text: string, errorLogger: (message: string) => void): string {
    const lines: string[] = text.replace('\r', '').split('\n');

    enum State {
      Start,
      Body,
      Done,
      Error
    }
    let state: State = State.Start;

    const startRegExp: RegExp = /^\s*\/\*\*+ ?/;
    const bodyRegExp: RegExp = /^\s*\* ?/;
    const endRegExp: RegExp = /^\s*\*+\/\s*$/;
    const singleLineEndRegExp: RegExp = / ?\*+\/\s*$/;

    let content: string = '';
    for (const line of lines) {
      if (line.trim().length === 0) {
        continue;
      }

      let modified: string = line;
      switch (state) {
        case State.Start:
          if (line.match(startRegExp)) {
            modified = line.replace(startRegExp, '');
            if (modified.match(singleLineEndRegExp)) {
              modified = modified.replace(singleLineEndRegExp, '');
              state = State.Done;
            } else {
              state = State.Body;
            }
          } else {
            state = State.Error;
          }
          break;
        case State.Body:
          if (line.match(endRegExp)) {
            modified = line.replace(endRegExp, '');
            state = State.Done;
          } else if (line.match(bodyRegExp)) {
            modified = line.replace(bodyRegExp, '');
          } else {
            state = State.Error;
          }
          break;
        case State.Done:
          state = State.Error;
          break;
      }
      if (modified !== '') {
        if (content !== '') {
          content += '\n';
        }
        content += modified;
      }
    }

    if (state !== State.Done) {
      errorLogger('Invalid JSDoc comment syntax');
      return '';
    }

    return content;
  }

}
