// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ParseError } from './ParseError.ts';
import { type Tokenizer, type Token, TokenKind } from './Tokenizer.ts';
import { type AstNode, AstScript, AstCommand, AstCompoundWord, AstText } from './AstNode.ts';

export class Parser {
  private readonly _tokenizer: Tokenizer;
  private _peekedToken: Token | undefined;

  public constructor(tokenizer: Tokenizer) {
    this._tokenizer = tokenizer;
    this._peekedToken = undefined;
  }

  public parse(): AstScript {
    const script: AstScript = new AstScript();

    const startingToken: Token = this._peekToken();

    const astCommand: AstCommand | undefined = this._parseCommand();

    if (!astCommand) {
      throw new ParseError('Expecting a command', startingToken.range);
    }

    const nextToken: Token = this._peekToken();

    if (nextToken.kind !== TokenKind.EndOfInput) {
      throw new ParseError(`Unexpected token: ${TokenKind[nextToken.kind]}`, nextToken.range);
    }

    script.body = astCommand;

    return script;
  }

  private _parseCommand(): AstCommand | undefined {
    this._skipWhitespace();

    const startingToken: Token = this._peekToken();

    const command: AstCommand = new AstCommand();
    command.commandPath = this._parseCompoundWord();
    if (!command.commandPath) {
      throw new ParseError('Expecting a command path', startingToken.range);
    }

    while (this._skipWhitespace()) {
      const compoundWord: AstCompoundWord | undefined = this._parseCompoundWord();
      if (!compoundWord) {
        break;
      }
      command.arguments.push(compoundWord);
    }

    return command;
  }

  private _parseCompoundWord(): AstCompoundWord | undefined {
    const compoundWord: AstCompoundWord = new AstCompoundWord();

    for (;;) {
      const node: AstNode | undefined = this._parseText();
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

  private _parseText(): AstText | undefined {
    const token: Token = this._peekToken();

    if (token.kind === TokenKind.Text) {
      this._readToken();

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
  private _skipWhitespace(): boolean {
    let sawWhitespace: boolean = false;
    while (this._peekToken().kind === TokenKind.Spaces) {
      this._readToken();
      sawWhitespace = true;
    }
    if (this._peekToken().kind === TokenKind.EndOfInput) {
      sawWhitespace = true;
    }
    return sawWhitespace;
  }

  private _readToken(): Token {
    if (this._peekedToken) {
      const token: Token = this._peekedToken;
      this._peekedToken = undefined;
      return token;
    } else {
      return this._tokenizer.readToken();
    }
  }

  private _peekToken(): Token {
    if (!this._peekedToken) {
      this._peekedToken = this._tokenizer.readToken();
    }
    return this._peekedToken;
  }
}
