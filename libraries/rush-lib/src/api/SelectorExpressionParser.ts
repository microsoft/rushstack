// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ExpressionJson, ISelectorJson, IFilterJson, IOperatorJson } from './SelectorExpressionJson';

/* eslint-disable @typescript-eslint/consistent-type-definitions */

export type Token =
  | LeftParenToken
  | RightParenToken
  | UnaryOperatorToken
  | BinaryOperatorToken
  | FilterToken
  | SelectorToken;

export type LeftParenToken = {
  type: '(';
};

export type RightParenToken = {
  type: ')';
};

export type UnaryOperatorToken = {
  type: 'unary';
  op: string;
};

export type BinaryOperatorToken = {
  type: 'binary';
  op: string;
};

export type FilterToken = {
  type: 'filter';
  filter: string;
};

export type SelectorToken = {
  type: 'selector';
  selector: string;
};

/* eslint-enable @typescript-eslint/consistent-type-definitions */

/**
 * The SelectorExpressionParser is a small, stand-alone parser designed to take a string-based selector expression
 * and turn it into a JSON-based selector expression. This selector expression is repo-agnostic, and should
 * be something that a Rush project selector would eventually interpret to produce a list of projects.
 *
 * (Note: the parser is not truly "repo-agnostic" because it asks you to pass in a list of the supported filter
 * keywords, which in the future could depend on Rush plugins installed in the repo. So an expression.)
 *
 * The parser intentionally does not dive into the internal implementation of selector parameters or implementations.
 * For example, "git:origin/main" is not validated as a valid selector, or resolved into a GitChangedProjectSelector.
 * That's because we want the output of this parser to also be a valid input (in a future configuration file, for
 * example) into the Project Selector API.
 */
export class SelectorExpressionParser {
  private _tokens: Token[];
  private _pLevel: number;

  public constructor(tokens: Token[]) {
    this._tokens = tokens;
    this._pLevel = 0;
  }

  private _eof(): boolean {
    return this._tokens.length === 0;
  }

  private _peek(): Token {
    if (this._eof()) throw new Error('eof');
    return this._tokens[0]!;
  }

  private _consume(type: '('): LeftParenToken;
  private _consume(type: ')'): RightParenToken;
  private _consume(type: 'selector'): SelectorToken;
  private _consume(type: 'unary'): UnaryOperatorToken;
  private _consume(type: 'binary'): BinaryOperatorToken;
  private _consume(type: 'filter'): FilterToken;
  private _consume(type: string): Token {
    if (this._eof()) throw new Error('eof');
    if (type && this._tokens[0].type !== type) {
      throw new Error(`Expected ${type} but got ${this._tokens[0].type}`);
    }
    return this._tokens.shift()!;
  }

  private _parseSelector(): ISelectorJson {
    const token: SelectorToken = this._consume('selector');

    const scopeIndex: number = token.selector.indexOf(':');
    let scope: string;
    let value: string;

    if (scopeIndex >= 0) {
      scope = token.selector.slice(0, scopeIndex);
      value = token.selector.slice(scopeIndex + 1);
    } else {
      scope = 'name';
      value = token.selector;
    }

    return {
      scope: scope,
      value: value
    };
  }

  private _parseUnaryOperator(): IOperatorJson {
    const token: UnaryOperatorToken = this._consume('unary');
    const arg: ExpressionJson = this._parseLeftSideExpression();

    return {
      op: token.op,
      args: [arg]
    };
  }

  private _parseFilter(): IFilterJson {
    const token: FilterToken = this._consume('filter');
    const arg: ExpressionJson = this._parseLeftSideExpression();

    return {
      filter: token.filter,
      arg: arg
    };
  }

  private _parseLeftSideExpression(): ExpressionJson {
    const token: Token = this._peek();

    if (token.type === '(') {
      this._consume('(');
      this._pLevel++;
      return this._parseExpression();
    } else if (token.type === 'unary') {
      return this._parseUnaryOperator();
    } else if (token.type === 'filter') {
      return this._parseFilter();
    } else if (token.type === 'selector') {
      return this._parseSelector();
    } else {
      throw new Error(`Expected token good, but saw ${JSON.stringify(token)}`);
    }
  }

  private _parseExpression(): ExpressionJson {
    const components: Array<ExpressionJson | Token> = [];

    // Unary operators and filters can be handled while parsing left-side
    // expression blocks. We'll wait until there are no more to process
    // before combining binary operators.

    components.push(this._parseLeftSideExpression());

    while (!this._eof()) {
      const token: Token = this._peek();

      if (token.type === ')') {
        if (this._pLevel > 0) {
          this._pLevel--;
          this._consume(')');
          break;
        }
        throw new Error('unexpected )');
      }

      if (token.type === 'binary') {
        components.push(this._consume('binary'));
      }

      components.push(this._parseLeftSideExpression());
    }

    // Once all unary operators are complete, apply all "and" operators
    this._combineInlineBinaryOperators(components, 'and');

    // Last, apply all "or" operators
    this._combineInlineBinaryOperators(components, 'or');

    if (components.length !== 1) {
      throw new Error('should be exactly 1');
    }

    return components[0] as ExpressionJson;
  }

  private _combineInlineBinaryOperators(components: Array<ExpressionJson | Token>, op: string): void {
    for (let i: number = 0; i < components.length; i++) {
      // Here we are looking for not-yet-consumed binary tokens, and turning them
      // into consumed binary expressions.
      if (
        (components[i] as BinaryOperatorToken).type === 'binary' &&
        (components[i] as BinaryOperatorToken).op === op
      ) {
        components.splice(i - 1, 3, {
          op: op,
          args: [components[i - 1] as ExpressionJson, components[i + 1] as ExpressionJson]
        });
        i = 0;
      }
    }
  }

  public parse(): ExpressionJson {
    return this._parseExpression();
  }

  /**
   * Take an input string, in selector expression format, and turn it into a list of
   * internal tokens. This simple tokenizer/lexer pass is performed before turning
   * the list of tokens into an expression tree.
   *
   * By default, the internal binary operators "and" and "or" and the internal unary
   * operator "not" are supported; any other keywords that you wish to be interpreted
   * as unary operators must be provided.
   */
  public static tokenize(expr: string, keywords: string[]): Token[] {
    const tokens: Token[] = [];
    let token: string = '';

    const operators: Record<string, 'unary' | 'binary'> = {
      and: 'binary',
      or: 'binary',
      not: 'unary'
    };

    let state: 'flat' | 'selector' = 'flat';

    for (const c of expr) {
      switch (state) {
        case 'flat':
          if (c === '[') {
            if (token !== '') {
              throw new Error('found [ in middle of some other expr');
            }
            state = 'selector';
          } else if (c === ']') {
            throw new Error('found ] in middle of some other expr');
          } else if (c === '(' || c === ')') {
            if (token) {
              if (operators[token]) {
                tokens.push({ type: operators[token], op: token });
              } else {
                tokens.push({ type: 'selector', selector: token });
              }
              token = '';
            }
            tokens.push({ type: c });
          } else if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
            if (token) {
              if (operators[token]) {
                tokens.push({ type: operators[token], op: token });
              } else if (keywords.includes(token)) {
                tokens.push({ type: 'filter', filter: token });
              } else {
                tokens.push({ type: 'selector', selector: token });
              }
              token = '';
            }
          } else {
            token += c;
          }
          break;
        case 'selector':
          if (c === '[') {
            throw new Error('found [ in selector');
          } else if (c === ']') {
            tokens.push({ type: 'selector', selector: token });
            token = '';
            state = 'flat';
          } else {
            token += c;
          }
          break;
      }
    }
    if (token) {
      tokens.push({ type: 'selector', selector: token });
    }

    return tokens;
  }

  public static parse(expr: string, allowedFilters: string[]): ExpressionJson {
    const tokens: Token[] = SelectorExpressionParser.tokenize(expr, allowedFilters);
    return new SelectorExpressionParser(tokens).parse();
  }
}
