// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TextRange } from './TextRange';
import { ParseError } from './ParseError';

export enum TokenKind {
  // One or more spaces/tabs
  Spaces,

  // A single newline sequence such as CRLF or LF
  NewLine,

  // A general character without any special meaning
  OtherCharacter,

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
  #currentIndex: number;

  public constructor(input: TextRange | string) {
    if (typeof input === 'string') {
      this.input = TextRange.fromString(input);
    } else {
      this.input = input;
    }
    this.#currentIndex = this.input.pos;
  }

  public get currentIndex(): number {
    return this.#currentIndex;
  }

  public readToken(): Token {
    const input: TextRange = this.input;

    const startIndex: number = this.#currentIndex;
    const firstChar: string | undefined = this.#peekCharacter();

    // Reached end of input yet?
    if (firstChar === undefined) {
      return new Token(TokenKind.EndOfInput, TextRange.empty);
    }

    // Is it a sequence of whitespace?
    if (_isSpace(firstChar)) {
      this.#readCharacter();

      while (_isSpace(this.#peekCharacter())) {
        this.#readCharacter();
      }

      return new Token(TokenKind.Spaces, input.getNewRange(startIndex, this.#currentIndex));
    }

    // Is it a newline?
    if (firstChar === '\r') {
      this.#readCharacter();
      if (this.#peekCharacter() === '\n') {
        this.#readCharacter();
      }
      return new Token(TokenKind.NewLine, input.getNewRange(startIndex, this.#currentIndex));
    } else if (firstChar === '\n') {
      this.#readCharacter();
      return new Token(TokenKind.NewLine, input.getNewRange(startIndex, this.#currentIndex));
    }

    // Is it a double-quoted string?
    if (firstChar === '"') {
      this.#readCharacter(); // consume the opening quote

      let text: string = '';
      let c: string | undefined = this.#peekCharacter();
      while (c !== '"') {
        if (c === undefined) {
          throw new ParseError(
            'The double-quoted string is missing the ending quote',
            input.getNewRange(startIndex, this.#currentIndex)
          );
        }
        if (c === '\r' || c === '\n') {
          throw new ParseError(
            'Newlines are not supported inside strings',
            input.getNewRange(this.#currentIndex, this.#currentIndex + 1)
          );
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
          this.#readCharacter(); // discard the backslash
          if (this.#peekCharacter() === undefined) {
            throw new ParseError(
              'A backslash must be followed by another character',
              input.getNewRange(this.#currentIndex, this.#currentIndex + 1)
            );
          }
          // Add the escaped character
          text += this.#readCharacter();
        } else {
          text += this.#readCharacter();
        }

        c = this.#peekCharacter();
      }
      this.#readCharacter(); // consume the closing quote

      return new Token(TokenKind.DoubleQuotedText, input.getNewRange(startIndex, this.#currentIndex), text);
    }

    // Is it a text token?
    if (textCharacterRegExp.test(firstChar)) {
      let text: string = '';
      let c: string | undefined = firstChar;
      do {
        if (c === '\\') {
          this.#readCharacter(); // discard the backslash
          if (this.#peekCharacter() === undefined) {
            throw new ParseError(
              'A backslash must be followed by another character',
              input.getNewRange(this.#currentIndex, this.#currentIndex + 1)
            );
          }
          // Add the escaped character
          text += this.#readCharacter();
        } else {
          text += this.#readCharacter();
        }

        c = this.#peekCharacter();
      } while (c && textCharacterRegExp.test(c));

      return new Token(TokenKind.Text, input.getNewRange(startIndex, this.#currentIndex), text);
    }

    // Is it a dollar variable?  The valid environment variable names are [A-Z_][A-Z0-9_]*
    if (firstChar === '$') {
      this.#readCharacter();

      let name: string = this.#readCharacter() || '';
      if (!startVariableCharacterRegExp.test(name)) {
        throw new ParseError(
          'The "$" symbol must be followed by a letter or underscore',
          input.getNewRange(startIndex, this.#currentIndex)
        );
      }

      let c: string | undefined = this.#peekCharacter();
      while (c && variableCharacterRegExp.test(c)) {
        name += this.#readCharacter();
        c = this.#peekCharacter();
      }
      return new Token(TokenKind.DollarVariable, input.getNewRange(startIndex, this.#currentIndex), name);
    }

    // Is it the "&&" token?
    if (firstChar === '&') {
      if (this.#peekCharacterAfter() === '&') {
        this.#readCharacter();
        this.#readCharacter();
        return new Token(TokenKind.AndIf, input.getNewRange(startIndex, this.#currentIndex));
      }
    }

    // Otherwise treat it as an "other" character
    this.#readCharacter();
    return new Token(TokenKind.OtherCharacter, input.getNewRange(startIndex, this.#currentIndex));
  }

  public readTokens(): Token[] {
    const tokens: Token[] = [];
    let token: Token = this.readToken();
    while (token.kind !== TokenKind.EndOfInput) {
      tokens.push(token);
      token = this.readToken();
    }
    return tokens;
  }

  /**
   * Retrieve the next character in the input stream.
   * @returns a string of length 1, or undefined if the end of input is reached
   */
  #readCharacter(): string | undefined {
    if (this.#currentIndex >= this.input.end) {
      return undefined;
    }
    return this.input.buffer[this.#currentIndex++];
  }

  /**
   * Return the next character in the input stream, but don't advance the stream pointer.
   * @returns a string of length 1, or undefined if the end of input is reached
   */
  #peekCharacter(): string | undefined {
    if (this.#currentIndex >= this.input.end) {
      return undefined;
    }
    return this.input.buffer[this.#currentIndex];
  }

  /**
   * Return the character after the next character in the input stream, but don't advance the stream pointer.
   * @returns a string of length 1, or undefined if the end of input is reached
   */
  #peekCharacterAfter(): string | undefined {
    if (this.#currentIndex + 1 >= this.input.end) {
      return undefined;
    }
    return this.input.buffer[this.#currentIndex + 1];
  }
}

function _isSpace(c: string | undefined): boolean {
  // You can empirically test whether shell treats a given character as whitespace like this:
  // echo $(echo -e a '\u0009' b)
  // If you get "a b" it means the tab character (Unicode 0009) is being collapsed away.
  // If you get "a   b" then the invisible character is being padded like a normal letter.
  return c === ' ' || c === '\t';
}
