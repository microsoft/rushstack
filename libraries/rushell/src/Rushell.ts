// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as child_process from 'node:child_process';
import { Executable } from '@rushstack/node-core-library';
import { Parser } from './Parser';

import { Tokenizer } from './Tokenizer';
import { type AstNode, type AstScript, AstKind, type AstCommand } from './AstNode';
import { ParseError } from './ParseError';

/**
 * The returned value for {@link Rushell.execute}.
 * @beta
 */
export interface IRushellExecuteResult {
  /**
   * A text value that was the result of evaluating the script expression.
   */
  value: string;
}

/**
 * The shell command interpreter.
 * @beta
 */
export class Rushell {
  public execute(script: string): IRushellExecuteResult {
    const tokenizer: Tokenizer = new Tokenizer(script);
    const parser: Parser = new Parser(tokenizer);
    const astScript: AstScript = parser.parse();

    return this._evaluateNode(astScript);
  }

  private _evaluateNode(astNode: AstNode): IRushellExecuteResult {
    switch (astNode.kind) {
      case AstKind.CompoundWord:
        return { value: astNode.parts.map((x) => this._evaluateNode(x).value).join('') };
      case AstKind.Text:
        return { value: astNode.token!.range.toString() };
      case AstKind.Script:
        if (astNode.body) {
          return this._evaluateNode(astNode.body);
        }
        break;
      case AstKind.Command:
        return this._evaluateCommand(astNode);
      default:
        throw new ParseError('Unsupported operation type: ' + astNode.kind, astNode.getFullRange());
    }
    return { value: '' };
  }

  private _evaluateCommand(astCommand: AstCommand): IRushellExecuteResult {
    if (!astCommand.commandPath) {
      throw new ParseError('Missing command path', astCommand.getFullRange());
    }

    const commandPathResult: IRushellExecuteResult = this._evaluateNode(astCommand.commandPath);
    const commandArgResults: IRushellExecuteResult[] = [];
    for (let i: number = 0; i < astCommand.arguments.length; ++i) {
      commandArgResults.push(this._evaluateNode(astCommand.arguments[i]));
    }

    const commandPath: string = commandPathResult.value;
    const commandArgs: string[] = commandArgResults.map((x) => x.value);

    const result: child_process.SpawnSyncReturns<string> = Executable.spawnSync(commandPath, commandArgs);

    return { value: result.stdout };
  }
}
