/* tslint:disable:no-bitwise */

import * as ts from 'typescript';
import PrettyPrinter from './PrettyPrinter';

export default class TypeScriptHelpers {

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
   * Returns the JSDoc comments associated with the specified node, if any.
   */
  public static getJsDocComments(node: ts.Node, sourceFile: ts.SourceFile): ts.CommentRange[] {
    // tslint:disable-next-line:no-any
    return (ts as any).getJsDocComments(node, sourceFile);
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
    let match: RegExpExecArray;

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
   * Extracts the body of a TypeScript comment and returns it.
   */
  // Examples:
  // "/**\n * this is\n * a test\n */\n" --> "this is\na test"
  // "/** single line comment */" --> "single line comment"
  public static extractCommentContent(text: string): string {
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
      return '[ERROR PARSING COMMENT]';
    }

    return content;
  }

}
