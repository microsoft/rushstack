// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import stringArgv from 'string-argv';

import { CommandLineIntegerParameter } from '../parameters/CommandLineIntegerParameter';
import { CommandLineStringParameter } from '../parameters/CommandLineStringParameter';
import { CommandLineParameterKind, CommandLineParameter } from '../parameters/BaseClasses';
import { CommandLineAction } from './CommandLineAction';
import { CommandLineChoiceParameter } from '..';
import { CommandLineConstants } from '../Constants';

interface IParameter {
  name: string;
  parameterInfo: CommandLineParameter;
}

const DEFAULT_WORD_TO_AUTOCOMPLETE: string = '';
const DEFAULT_POSITION: number = 0;

export class TabCompleteAction extends CommandLineAction {
  private _wordToCompleteParameter: CommandLineStringParameter;
  private _positionParameter: CommandLineIntegerParameter;
  private _actions: ReadonlyArray<CommandLineAction>;
  private _globalParameters: ReadonlyArray<CommandLineParameter>;

  public constructor(
    actions: ReadonlyArray<CommandLineAction>,
    globalParameters: ReadonlyArray<CommandLineParameter>
  ) {
    super({
      actionName: CommandLineConstants.TabCompletionActionName,
      summary: 'Provides tab completion.',
      documentation: 'Provides tab completion.'
    });

    this._actions = actions;
    this._globalParameters = globalParameters;
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
    await this.runAsync();
  }

  protected async runAsync(): Promise<void> {
    const commandLine: string = this._wordToCompleteParameter.value || '';
    const caretPosition: number = this._positionParameter.value || 0;

    for await (const value of this.getCompletions(commandLine, caretPosition)) {
      console.log(value);
    }
  }

  public async *getCompletions(commandLine: string, caretPosition: number): AsyncIterable<string> {
    const actions: Map<string, Map<string, CommandLineParameter>> = new Map<
      string,
      Map<string, CommandLineParameter>
    >();
    for (const action of this._actions) {
      const parameterNameToParameterInfoMap: IParameter[] = [];
      action.parameters.forEach((parameter) => {
        parameterNameToParameterInfoMap[parameter.longName] = parameter;
        if (parameter.shortName) {
          parameterNameToParameterInfoMap[parameter.shortName] = parameter;
        }
      });
      actions[action.actionName] = parameterNameToParameterInfoMap;
    }

    for (const parameter of this._globalParameters) {
      actions[parameter.longName] = parameter;
      if (parameter.shortName) {
        actions[parameter.shortName] = parameter;
      }
    }

    if (!commandLine || !caretPosition) {
      yield* Object.keys(actions); // return all actions
      return;
    }

    const tokens: string[] = Array.from(this.tokenizeCommandLine(commandLine));

    // offset arguments by the number of global params in the input
    const globalParameterOffset: number = this._getGlobalParameterOffset(tokens);

    if (tokens.length < 2 + globalParameterOffset) {
      yield* Object.keys(actions); // return all actions
      return;
    }

    const lastToken: string = tokens[tokens.length - 1];
    const secondLastToken: string = tokens[tokens.length - 2];

    const completePartialWord: boolean = caretPosition === commandLine.length;

    if (completePartialWord && tokens.length === 2 + globalParameterOffset) {
      for (const actionName of Object.keys(actions)) {
        if (actionName.indexOf(tokens[1 + globalParameterOffset]) === 0) {
          yield actionName;
        }
      }
    } else {
      for (const actionName of Object.keys(actions)) {
        if (actionName === tokens[1 + globalParameterOffset]) {
          const parameterNameMap: Map<string, CommandLineParameter> = actions[actionName];

          const parameterNames: string[] = Array.from(Object.keys(actions[actionName]), (x: string) => x);

          if (completePartialWord) {
            for (const parameterName of parameterNames) {
              if (parameterName === secondLastToken) {
                const values: string[] = await this._getParameterValueCompletions(
                  parameterNameMap[parameterName]
                );
                if (values.length > 0) {
                  yield* this._completeParameterValues(values, lastToken);
                  return;
                }
              }
            }
            yield* this._completeParameterValues(parameterNames, lastToken);
          } else {
            for (const parameterName of parameterNames) {
              if (parameterName === lastToken) {
                const values: string[] = await this._getParameterValueCompletions(
                  parameterNameMap[parameterName]
                );
                if (values.length > 0) {
                  yield* values;
                  return;
                }
              }
            }
            for (const parameter of parameterNames) {
              if (
                parameter === lastToken &&
                parameterNameMap[parameter].kind !== CommandLineParameterKind.Flag
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
    let count: number = 0;
    for (let i: number = 1; i < tokens.length; i++) {
      for (const globalParameter of this._globalParameters) {
        if (tokens[i] !== globalParameter.longName && tokens[i] !== globalParameter.shortName) {
          break;
        }
        count++;
      }
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
