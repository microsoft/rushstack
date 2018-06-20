// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TextRange } from './TextRange';

export enum TokenKind {
  // One or more spaces/tabs
  Spaces,
  // A single newline sequence such as CRLF or LF
  NewLine,
  // An unrecognized character
  Other,
  // The end of the input string
  EndOfInput
}

export class Token {
  public readonly kind: TokenKind;
  public readonly range: TextRange;

  public constructor(kind: TokenKind, range: TextRange) {
    this.kind = kind;
    this.range = range;
  }

  public toString(): string {
    return this.range.toString();
  }
}

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
    let c: string | undefined = this._get();

    // Reached end of input yet?
    if (c === undefined) {
      return new Token(TokenKind.EndOfInput, TextRange.empty);
    }

    // Is it a sequence of whitespace?
    if (/[ \t]/.test(c)) {

      while (Tokenizer._isSpace(this._peek())) {
        this._get();
      }

      return new Token(TokenKind.Spaces, input.getNewRange(startIndex, this._currentIndex));
    }

    // Is it a newline?
    if (c === '\r') {
      if (this._peek() === '\n') {
        this._get();
      }
      return new Token(TokenKind.NewLine, input.getNewRange(startIndex, this._currentIndex));
    } else if (c === '\n') {
      return new Token(TokenKind.NewLine, input.getNewRange(startIndex, this._currentIndex));
    }

    // Otherwise treat it as an "other" character
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

  private static _isSpace(c: string | undefined): boolean {
    return c === ' ' || c === '\t';
  }
}
