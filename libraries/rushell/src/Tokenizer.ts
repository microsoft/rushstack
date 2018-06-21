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

const wordCharacterOrBackslashRegExp: RegExp = /[a-z0-9_\\]/i;

export class Tokenizer {
  public readonly input: TextRange;
  private _currentIndex: number;

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
    if (/[ \t]/.test(firstChar)) {
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

    // Is it a text token?
    if (wordCharacterOrBackslashRegExp.test(firstChar)) {
      let text: string = '';
      let c: string | undefined = firstChar;
      do {
        if (c === '\\') {
          this._get(); // discard the backslash
          if (this._peek() === undefined) {
            throw new ParseError('Backslash encountered at end of stream',
              input.getNewRange(this._currentIndex, this._currentIndex+1));
          }
          text += this._get();
        } else {
          text += this._get();
        }

        c = this._peek();
        if (c == undefined) {
          break;
        }
      } while (wordCharacterOrBackslashRegExp.test(c));

      return new Token(TokenKind.Text, input.getNewRange(startIndex, this._currentIndex), text);
    }

    // Is it the "&&" token?
    if (firstChar === '&') {
      if (this._peek2() === '&') {
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

  private _get(): string | undefined {
    if (this._currentIndex >= this.input.end) {
      return undefined;
    }
    return this.input.buffer[this._currentIndex++];
  }

  private _peek(): string | undefined {
    if (this._currentIndex >= this.input.end) {
      return undefined;
    }
    return this.input.buffer[this._currentIndex];
  }

  private _peek2(): string | undefined {
    if (this._currentIndex+1 >= this.input.end) {
      return undefined;
    }
    return this.input.buffer[this._currentIndex+1];
  }

  private static _isSpace(c: string | undefined): boolean {
    return c === ' ' || c === '\t';
  }
}
