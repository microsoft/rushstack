// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import stringArgv from 'string-argv';

import type { IRequiredCommandLineIntegerParameter } from '../parameters/CommandLineIntegerParameter.ts';
import type { IRequiredCommandLineStringParameter } from '../parameters/CommandLineStringParameter.ts';
import {
  CommandLineParameterKind,
  type CommandLineParameterBase,
  CommandLineParameterWithArgument,
  type CommandLineParameter
} from '../parameters/BaseClasses.ts';
import { CommandLineChoiceParameter } from '../parameters/CommandLineChoiceParameter.ts';
import { CommandLineAction } from './CommandLineAction.ts';
import { CommandLineConstants } from '../Constants.ts';

const DEFAULT_WORD_TO_AUTOCOMPLETE: string = '';
const DEFAULT_POSITION: number = 0;

export class TabCompleteAction extends CommandLineAction {
  private readonly _wordToCompleteParameter: IRequiredCommandLineStringParameter;
  private readonly _positionParameter: IRequiredCommandLineIntegerParameter;
  private readonly _actions: Map<string, Map<string, CommandLineParameter>>;
  private readonly _globalParameters: Map<string, CommandLineParameter>;

  public constructor(
    actions: ReadonlyArray<CommandLineAction>,
    globalParameters: ReadonlyArray<CommandLineParameterBase>
  ) {
    super({
      actionName: CommandLineConstants.TabCompletionActionName,
      summary: 'Provides tab completion.',
      documentation: 'Provides tab completion.'
    });

    this._actions = new Map();
    for (const action of actions) {
      const parameterNameToParameterInfoMap: Map<string, CommandLineParameter> = new Map();
      for (const parameter of action.parameters) {
        parameterNameToParameterInfoMap.set(parameter.longName, parameter as CommandLineParameter);
        if (parameter.shortName) {
          parameterNameToParameterInfoMap.set(parameter.shortName, parameter as CommandLineParameter);
        }
      }
      this._actions.set(action.actionName, parameterNameToParameterInfoMap);
    }

    this._globalParameters = new Map<string, CommandLineParameter>();
    for (const parameter of globalParameters) {
      this._globalParameters.set(parameter.longName, parameter as CommandLineParameter);
      if (parameter.shortName) {
        this._globalParameters.set(parameter.shortName, parameter as CommandLineParameter);
      }
    }

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

  protected override async onExecuteAsync(): Promise<void> {
    const commandLine: string = this._wordToCompleteParameter.value;
    const caretPosition: number = this._positionParameter.value || commandLine.length;

    for await (const value of this.getCompletionsAsync(commandLine, caretPosition)) {
      // eslint-disable-next-line no-console
      console.log(value);
    }
  }

  public async *getCompletionsAsync(
    commandLine: string,
    caretPosition: number = commandLine.length
  ): AsyncIterable<string> {
    const actions: Map<string, Map<string, CommandLineParameter>> = this._actions;

    if (!commandLine || !caretPosition) {
      yield* this._getAllActions();
      return;
    }

    const tokens: string[] = Array.from(this.tokenizeCommandLine(commandLine));

    // offset arguments by the number of global params in the input
    const globalParameterOffset: number = this._getGlobalParameterOffset(tokens);

    if (tokens.length < 2 + globalParameterOffset) {
      yield* this._getAllActions();
      return;
    }

    const lastToken: string = tokens[tokens.length - 1];
    const secondLastToken: string = tokens[tokens.length - 2];

    const lastCharacterIsWhitespace: boolean = !commandLine.slice(-1).trim();
    const completePartialWord: boolean = caretPosition === commandLine.length && !lastCharacterIsWhitespace;

    if (completePartialWord && tokens.length === 2 + globalParameterOffset) {
      for (const actionName of actions.keys()) {
        if (actionName.indexOf(tokens[1 + globalParameterOffset]) === 0) {
          yield actionName;
        }
      }
    } else {
      for (const actionName of actions.keys()) {
        if (actionName === tokens[1 + globalParameterOffset]) {
          const parameterNameMap: Map<string, CommandLineParameter> = actions.get(actionName)!;

          const parameterNames: string[] = Array.from(parameterNameMap.keys());

          if (completePartialWord) {
            for (const parameterName of parameterNames) {
              if (parameterName === secondLastToken) {
                const values: ReadonlySet<string> = await this._getParameterValueCompletionsAsync(
                  parameterNameMap.get(parameterName)!
                );
                if (values.size > 0) {
                  yield* this._completeParameterValues(values, lastToken);
                  return;
                }
              }
            }
            yield* this._completeParameterValues(parameterNames, lastToken);
          } else {
            for (const parameterName of parameterNames) {
              if (parameterName === lastToken) {
                const values: ReadonlySet<string> = await this._getParameterValueCompletionsAsync(
                  parameterNameMap.get(parameterName)!
                );
                if (values.size > 0) {
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

  private async _getParameterValueCompletionsAsync(
    parameter: CommandLineParameter
  ): Promise<ReadonlySet<string>> {
    let choiceParameterValues: ReadonlySet<string> | undefined;
    if (parameter.kind === CommandLineParameterKind.Choice) {
      choiceParameterValues = parameter.alternatives;
    } else if (parameter.kind !== CommandLineParameterKind.Flag) {
      let parameterWithArgumentOrChoices:
        | CommandLineParameterWithArgument
        | CommandLineChoiceParameter
        | undefined = undefined;
      if (
        parameter instanceof CommandLineParameterWithArgument ||
        parameter instanceof CommandLineChoiceParameter
      ) {
        parameterWithArgumentOrChoices = parameter;
      }

      const completionValues: ReadonlyArray<string> | ReadonlySet<string> | undefined =
        await parameterWithArgumentOrChoices?.getCompletionsAsync?.();
      choiceParameterValues = completionValues instanceof Set ? completionValues : new Set(completionValues);
    }

    return choiceParameterValues ?? new Set();
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
    choiceParameterValues: ReadonlyArray<string> | ReadonlySet<string>,
    lastToken: string
  ): IterableIterator<string> {
    for (const choiceParameterValue of choiceParameterValues) {
      if (choiceParameterValue.indexOf(lastToken) === 0) {
        yield choiceParameterValue;
      }
    }
  }
}
