// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ParseError } from './ParseError';
import { type Tokenizer, type Token, TokenKind } from './Tokenizer';
import { type AstNode, AstScript, AstCommand, AstCompoundWord, AstText } from './AstNode';

export class Parser {
  readonly #tokenizer: Tokenizer;
  #peekedToken: Token | undefined;

  public constructor(tokenizer: Tokenizer) {
    this.#tokenizer = tokenizer;
    this.#peekedToken = undefined;
  }

  public parse(): AstScript {
    const script: AstScript = new AstScript();

    const startingToken: Token = this.#peekToken();

    const astCommand: AstCommand | undefined = this.#parseCommand();

    if (!astCommand) {
      throw new ParseError('Expecting a command', startingToken.range);
    }

    const nextToken: Token = this.#peekToken();

    if (nextToken.kind !== TokenKind.EndOfInput) {
      throw new ParseError(`Unexpected token: ${TokenKind[nextToken.kind]}`, nextToken.range);
    }

    script.body = astCommand;

    return script;
  }

  #parseCommand(): AstCommand | undefined {
    this.#skipWhitespace();

    const startingToken: Token = this.#peekToken();

    const command: AstCommand = new AstCommand();
    command.commandPath = this.#parseCompoundWord();
    if (!command.commandPath) {
      throw new ParseError('Expecting a command path', startingToken.range);
    }

    while (this.#skipWhitespace()) {
      const compoundWord: AstCompoundWord | undefined = this.#parseCompoundWord();
      if (!compoundWord) {
        break;
      }
      command.arguments.push(compoundWord);
    }

    return command;
  }

  #parseCompoundWord(): AstCompoundWord | undefined {
    const compoundWord: AstCompoundWord = new AstCompoundWord();

    for (;;) {
      const node: AstNode | undefined = this.#parseText();
      if (!node) {
        break;
      }
      compoundWord.parts.push(node);
    }

    if (compoundWord.parts.length === 0) {
      // We didn't parse a word
      return undefined;
    }

    return compoundWord;
  }

  #parseText(): AstText | undefined {
    const token: Token = this.#peekToken();

    if (token.kind === TokenKind.Text) {
      this.#readToken();

      const astText: AstText = new AstText();
      astText.token = token;
      astText.range = token.range;
      return astText;
    }

    return undefined;
  }

  /**
   * Skips any whitespace tokens.  Returns true if any whitespace was actually encountered.
   */
  #skipWhitespace(): boolean {
    let sawWhitespace: boolean = false;
    while (this.#peekToken().kind === TokenKind.Spaces) {
      this.#readToken();
      sawWhitespace = true;
    }
    if (this.#peekToken().kind === TokenKind.EndOfInput) {
      sawWhitespace = true;
    }
    return sawWhitespace;
  }

  #readToken(): Token {
    if (this.#peekedToken) {
      const token: Token = this.#peekedToken;
      this.#peekedToken = undefined;
      return token;
    } else {
      return this.#tokenizer.readToken();
    }
  }

  #peekToken(): Token {
    if (!this.#peekedToken) {
      this.#peekedToken = this.#tokenizer.readToken();
    }
    return this.#peekedToken;
  }
}
