// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TextRange } from './TextRange';
import { ParseError } from './ParseError';

export enum TokenKind {
  // One or more spaces/tabs
  Spaces,
  // A single newline sequence such as CRLF or LF
  NewLine,
  // An unrecognized character
  Other,
  // A sequence of characters that doesn't contain any symbols with special meaning
  // Characters can be escaped, in which case the Token.text may differ from the
  // Token.range.toString()
  Text,

  // The "&&" operator, which executes the following command only if the preceding command
  // succeeded (i.e. returned a zero exit code).
  AndIf,

  // A double-quoted string which can do variable expansions
  DoubleQuotedText,

  // A dollar sign followed by an environment variable name
  DollarVariable,

  // The end of the input string
  EndOfInput
}

export class Token {
  public readonly kind: TokenKind;
  public readonly range: TextRange;

  /**
   * The extracted content, which depends on the type:
   *
   * Text: The unescaped content
   * DoubleQuotedText: The unescaped contents inside the quotes.
   * DollarVariable: The variable name without the "$"
   */
  public readonly text: string;

  public constructor(kind: TokenKind, range: TextRange, text?: string) {
    this.kind = kind;
    this.range = range;
    this.text = text === undefined ? this.range.toString() : text;
  }

  public toString(): string {
    return this.text;
  }
}

const textCharacterRegExp: RegExp = /[a-z0-9_\\]/i;
const startVariableCharacterRegExp: RegExp = /[a-z_]/i;
const variableCharacterRegExp: RegExp = /[a-z0-9_]/i;

export class Tokenizer {
  public readonly input: TextRange;
  private _currentIndex: number;

  private static _isSpace(c: string | undefined): boolean {
    return c === ' ' || c === '\t';
  }

  constructor(input: TextRange | string) {
    if (typeof(input) === 'string') {
      this.input = TextRange.fromString(input);
    } else {
      this.input = input;
    }
    this._currentIndex = this.input.pos;
  }

  public get currentIndex(): number {
    return this._currentIndex;
  }

  public getToken(): Token {
    const input: TextRange = this.input;

    const startIndex: number = this._currentIndex;
    const firstChar: string | undefined = this._peek();

    // Reached end of input yet?
    if (firstChar === undefined) {
      return new Token(TokenKind.EndOfInput, TextRange.empty);
    }

    // Is it a sequence of whitespace?
    if (Tokenizer._isSpace(firstChar)) {
      this._get();

      while (Tokenizer._isSpace(this._peek())) {
        this._get();
      }

      return new Token(TokenKind.Spaces, input.getNewRange(startIndex, this._currentIndex));
    }

    // Is it a newline?
    if (firstChar === '\r') {
      this._get();
      if (this._peek() === '\n') {
        this._get();
      }
      return new Token(TokenKind.NewLine, input.getNewRange(startIndex, this._currentIndex));
    } else if (firstChar === '\n') {
      this._get();
      return new Token(TokenKind.NewLine, input.getNewRange(startIndex, this._currentIndex));
    }

    // Is it a double-quoted string?
    if (firstChar === '"') {
      this._get(); // consume the opening quote

      let text: string = '';
      let c: string | undefined = this._peek();
      while (c !== '"') {
        if (c === undefined) {
          throw new ParseError('The double-quoted string is missing the ending quote',
            input.getNewRange(startIndex, this._currentIndex));
        }
        if (c === '\r' || c === '\n') {
          throw new ParseError('Newlines are not supported inside strings',
            input.getNewRange(this._currentIndex, this._currentIndex + 1));
        }

        // NOTE: POSIX says that backslash acts as an escape character inside a double-quoted string
        // ONLY if followed by certain other characters.  For example, yes for "a\$" but no for "a\t".
        // Whereas Dash says yes for "a\t" but no for "a\q".  And then Bash says yes for "a\t".
        // This goes against Rushell's goal of being intuitive:  Nobody should have to memorize a list
        // of alphabet letters that cannot be escaped.  So we just say that backslash is *always* an
        // escape character inside a double-quoted string.
        //
        // NOTE: Dash interprets "\t" as a tab character, but Bash does not.
        if (c === '\\') {
          this._get(); // discard the backslash
          if (this._peek() === undefined) {
            throw new ParseError('A backslash must be followed by another character',
              input.getNewRange(this._currentIndex, this._currentIndex + 1));
          }
          // Add the escaped character
          text += this._get();
        } else {
          text += this._get();
        }

        c = this._peek();
      }
      this._get(); // consume the closing quote

      return new Token(TokenKind.DoubleQuotedText, input.getNewRange(startIndex, this._currentIndex), text);
    }

    // Is it a text token?
    if (textCharacterRegExp.test(firstChar)) {
      let text: string = '';
      let c: string | undefined = firstChar;
      do {
        if (c === '\\') {
          this._get(); // discard the backslash
          if (this._peek() === undefined) {
            throw new ParseError('A backslash must be followed by another character',
              input.getNewRange(this._currentIndex, this._currentIndex + 1));
          }
          // Add the escaped character
          text += this._get();
        } else {
          text += this._get();
        }

        c = this._peek();
      } while (c && textCharacterRegExp.test(c));

      return new Token(TokenKind.Text, input.getNewRange(startIndex, this._currentIndex), text);
    }

    // Is it a dollar variable?  The valid environment variable names are [A-Z_][A-Z0-9_]*
    if (firstChar === '$') {
      this._get();

      let name: string = this._get() || '';
      if (!startVariableCharacterRegExp.test(name)) {
        throw new ParseError('The "$" symbol must be followed by a letter or underscore',
          input.getNewRange(startIndex, this._currentIndex));
      }

      let c: string | undefined = this._peek();
      while (c && variableCharacterRegExp.test(c)) {
        name += this._get();
        c = this._peek();
      }
      return new Token(TokenKind.DollarVariable, input.getNewRange(startIndex, this._currentIndex), name);
    }

    // Is it the "&&" token?
    if (firstChar === '&') {
      if (this._peekTwice() === '&') {
        this._get();
        this._get();
        return new Token(TokenKind.AndIf, input.getNewRange(startIndex, this._currentIndex));
      }
    }

    // Otherwise treat it as an "other" character
    this._get();
    return new Token(TokenKind.Other, input.getNewRange(startIndex, this._currentIndex));
  }

  public getTokens(): Token[] {
    const tokens: Token[] = [];
    let token: Token = this.getToken();
    while (token.kind !== TokenKind.EndOfInput) {
      tokens.push(token);
      token = this.getToken();
    }
    return tokens;
  }

  /**
   * Retrieve the next character in the input stream.
   * @returns a string of length 1, or undefined if the end of input is reached
   */
  private _get(): string | undefined {
    if (this._currentIndex >= this.input.end) {
      return undefined;
    }
    return this.input.buffer[this._currentIndex++];
  }

  /**
   * Return the next character in the input stream, but don't advance the stream pointer.
   * @returns a string of length 1, or undefined if the end of input is reached
   */
  private _peek(): string | undefined {
    if (this._currentIndex >= this.input.end) {
      return undefined;
    }
    return this.input.buffer[this._currentIndex];
  }

  /**
   * Return the character after the next character in the input stream, but don't advance the stream pointer.
   * @returns a string of length 1, or undefined if the end of input is reached
   */
  private _peekTwice(): string | undefined {
    if (this._currentIndex + 1 >= this.input.end) {
      return undefined;
    }
    return this.input.buffer[this._currentIndex + 1];
  }
}
