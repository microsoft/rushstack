// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import stringArgv from 'string-argv';

import { CommandLineIntegerParameter } from '../parameters/CommandLineIntegerParameter';
import { CommandLineStringParameter } from '../parameters/CommandLineStringParameter';
import { CommandLineParameterKind, CommandLineParameter } from '../parameters/BaseClasses';
import { CommandLineAction } from './CommandLineAction';
import { CommandLineChoiceParameter } from '..';
import { CommandLineConstants } from '../Constants';

const DEFAULT_WORD_TO_AUTOCOMPLETE: string = '';
const DEFAULT_POSITION: number = 0;

export class TabCompleteAction extends CommandLineAction {
  private _wordToCompleteParameter: CommandLineStringParameter;
  private _positionParameter: CommandLineIntegerParameter;
  private readonly _actions: Map<string, Map<string, CommandLineParameter>>;
  private readonly _globalParameters: Map<string, CommandLineParameter>;

  public constructor(
    actions: ReadonlyArray<CommandLineAction>,
    globalParameters: ReadonlyArray<CommandLineParameter>
  ) {
    super({
      actionName: CommandLineConstants.TabCompletionActionName,
      summary: 'Provides tab completion.',
      documentation: 'Provides tab completion.'
    });

    this._actions = new Map<string, Map<string, CommandLineParameter>>();
    for (const action of actions) {
      const parameterNameToParameterInfoMap: Map<string, CommandLineParameter> = new Map<
        string,
        CommandLineParameter
      >();
      for (const parameter of action.parameters) {
        parameterNameToParameterInfoMap.set(parameter.longName, parameter);
        if (parameter.shortName) {
          parameterNameToParameterInfoMap.set(parameter.shortName, parameter);
        }
      }
      this._actions.set(action.actionName, parameterNameToParameterInfoMap);
    }

    this._globalParameters = new Map<string, CommandLineParameter>();
    for (const parameter of globalParameters) {
      this._globalParameters.set(parameter.longName, parameter);
      if (parameter.shortName) {
        this._globalParameters.set(parameter.shortName, parameter);
      }
    }
  }

  protected onDefineParameters(): void {
    this._wordToCompleteParameter = this.defineStringParameter({
      parameterLongName: '--word',
      argumentName: 'WORD',
      description: `The word to complete.`,
      defaultValue: DEFAULT_WORD_TO_AUTOCOMPLETE
    });

    this._positionParameter = this.defineIntegerParameter({
      parameterLongName: '--position',
      argumentName: 'INDEX',
      description: `The position in the word to be completed.`,
      defaultValue: DEFAULT_POSITION
    });
  }

  protected async onExecute(): Promise<void> {
    const commandLine: string = this._wordToCompleteParameter.value || '';
    const caretPosition: number = this._positionParameter.value || 0;

    for await (const value of this.getCompletions(commandLine, caretPosition)) {
      console.log(value);
    }
  }

  public async *getCompletions(commandLine: string, caretPosition: number): AsyncIterable<string> {
    const actions: Map<string, Map<string, CommandLineParameter>> = this._actions;

    if (!commandLine || !caretPosition) {
      yield* this._getAllActions();
      return;
    }

    const tokens: string[] = Array.from(this.tokenizeCommandLine(commandLine));

    // offset arguments by the number of global params in the input
    const globalParameterOffset: number = this._getGlobalParameterOffset(tokens);

    // for (let i: number = 0; i < tokens.length; i++) {
    //   yield 'token'+ i + tokens[i];
    // }

    // yield 'globalParameterOffset'+globalParameterOffset;

    if (tokens.length < 2 + globalParameterOffset) {
      yield* this._getAllActions();
      return;
    }

    const lastToken: string = tokens[tokens.length - 1];
    const secondLastToken: string = tokens[tokens.length - 2];

    const completePartialWord: boolean = caretPosition === commandLine.length;

    if (completePartialWord && tokens.length === 2 + globalParameterOffset) {
      // yield 'a1';
      // yield 'tokens1gl0'+tokens[1 + globalParameterOffset]
      for (const actionName of actions.keys()) {
        // yield 'a1' + actionName;
        if (actionName.indexOf(tokens[1 + globalParameterOffset]) === 0) {
          yield actionName;
        }
      }
    } else {
      // yield 'b1';
      for (const actionName of actions.keys()) {
        if (actionName === tokens[1 + globalParameterOffset]) {
          // yield 'c1' + actionName;
          const parameterNameMap: Map<string, CommandLineParameter> = actions.get(actionName)!;

          const parameterNames: string[] = Array.from(parameterNameMap.keys());

          if (completePartialWord) {
            // yield 'd1';
            for (const parameterName of parameterNames) {
              if (parameterName === secondLastToken) {
                const values: string[] = await this._getParameterValueCompletions(
                  parameterNameMap.get(parameterName)!
                );
                if (values.length > 0) {
                  yield* this._completeParameterValues(values, lastToken);
                  return;
                }
              }
            }
            yield* this._completeParameterValues(parameterNames, lastToken);
          } else {
            // yield 'e1';
            for (const parameterName of parameterNames) {
              if (parameterName === lastToken) {
                const values: string[] = await this._getParameterValueCompletions(
                  parameterNameMap.get(parameterName)!
                );
                if (values.length > 0) {
                  yield* values;
                  return;
                }
              }
            }
            for (const parameterName of parameterNames) {
              if (
                parameterName === lastToken &&
                parameterNameMap.get(parameterName)!.kind !== CommandLineParameterKind.Flag
              ) {
                // The parameter is expecting a value, so don't suggest parameter names again
                return;
              }
            }

            yield* parameterNames;
          }

          break;
        }
      }
    }
  }

  private *_getAllActions(): IterableIterator<string> {
    yield* this._actions.keys();
    yield* this._globalParameters.keys();
  }

  public tokenizeCommandLine(commandLine: string): string[] {
    return stringArgv(commandLine);
  }

  private async _getParameterValueCompletions(parameter: CommandLineParameter): Promise<string[]> {
    let choiceParameterValues: string[] = [];
    if (parameter.kind === CommandLineParameterKind.Choice) {
      choiceParameterValues = (parameter as CommandLineChoiceParameter).alternatives as string[];
    } else if (parameter.completions) {
      choiceParameterValues = await parameter.completions();
    }

    return choiceParameterValues;
  }

  private _getGlobalParameterOffset(tokens: string[]): number {
    const globalParameters: Map<string, CommandLineParameter> = this._globalParameters;
    let count: number = 0;

    outer: for (let i: number = 1; i < tokens.length; i++) {
      for (const globalParameter of globalParameters.values()) {
        if (tokens[i] !== globalParameter.longName && tokens[i] !== globalParameter.shortName) {
          break outer;
        }
      }
      count++;
    }

    return count;
  }

  private *_completeParameterValues(
    choiceParameterValues: string[],
    lastToken: string
  ): IterableIterator<string> {
    for (const choiceParameterValue of choiceParameterValues) {
      if (choiceParameterValue.indexOf(lastToken) === 0) {
        yield choiceParameterValue;
      }
    }
  }
}
