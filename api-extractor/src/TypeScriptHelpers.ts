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
  public static jsDocStartRegEx: RegExp = /^\s*\/\*\*\s?/g;

  /**
   * End sequence is '*\/'.
   */
  public static jsDocEndRegEx: RegExp = /\s*\*\/\s*$/g;

  /**
   * Intermediate lines of JSDoc comment character.
   */
  public static jsDocIntermediateRegEx: RegExp = /^\s*[*]\s?/g;

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
   *
   * Example:
   * "This \n is \n a comment" from "\/** This\r\n* is\r\n* a comment *\/
   */
  public static getJsDocComments(node: ts.Node, errorLogger: (message: string) => void): string {
    let jsDoc: string = '';
    // tslint:disable-next-line:no-any
    const nodeJsDocObjects: any = (node as any).jsDoc;
    if (nodeJsDocObjects && nodeJsDocObjects.length > 0) {
      // Use the JSDoc closest to the declaration
      const lastJsDocIndex: number = nodeJsDocObjects.length - 1;
      const jsDocFullText: string = nodeJsDocObjects[lastJsDocIndex].getText();
      const jsDocLines: string[] = jsDocFullText.split(TypeScriptHelpers.newLineRegEx);
      const jsDocStartSeqExists: boolean = TypeScriptHelpers.jsDocStartRegEx.test(jsDocLines[0].toString());
      if (!jsDocStartSeqExists) {
        errorLogger('JsDoc comment must begin with a \"/**\" sequence.');
        return '';
      }
      const jsDocEndSeqExists: boolean = TypeScriptHelpers.jsDocEndRegEx.test(
        jsDocLines[jsDocLines.length - 1].toString()
      );
      if (!jsDocEndSeqExists) {
        errorLogger('JsDoc comment must end with a \"*/\" sequence.');
        return '';
      }

      jsDoc = TypeScriptHelpers.removeJsDocSequences(jsDocLines);
    }

    return jsDoc;
  }

  /**
   * Helper function to remove the comment stars ('/**'. '*', '/*) from lines of comment text.
   * 
   * Example:
   * ["\/**", "*This \n", "*is \n", "*a comment", "*\/"] to "This \n is \n a comment"
   */
  public static removeJsDocSequences(textLines: string[]): string {
  // Remove '/**'
    textLines[0] = textLines[0].replace(TypeScriptHelpers.jsDocStartRegEx, '');
    if (textLines[0] === '') {
      textLines.shift();
    }
    // Remove '*/'
    textLines[textLines.length - 1] = textLines[textLines.length - 1].replace(
      TypeScriptHelpers.jsDocEndRegEx,
      '');
    if (textLines[textLines.length - 1] === '') {
      textLines.pop();
    }

    // Remove the leading '*' from any intermediate lines
    if (textLines.length > 0) {
      for (let i: number = 0; i < textLines.length; i++) {
        textLines[i] = textLines[i].replace(TypeScriptHelpers.jsDocIntermediateRegEx, '');
      }
    }

    return textLines.join('\n');
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
