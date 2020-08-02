// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { BaseRushAction } from './BaseRushAction';
import { RushCommandLineParser } from '../RushCommandLineParser';
import stringArgv from 'string-argv';

import {
  CommandLineStringParameter,
  CommandLineIntegerParameter,
  CommandLineChoiceParameter,
  CommandLineParameterKind,
  CommandLineParameter
} from '@rushstack/ts-command-line';

const DEFAULT_WORD_TO_AUTOCOMPLETE: string = '';
const DEFAULT_POSITION: number = 0;

export class TabCompleteAction extends BaseRushAction {
  private _wordToCompleteParameter: CommandLineStringParameter;
  private _positionParameter: CommandLineIntegerParameter;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'tab-complete',
      summary: 'Provides tab completion.',
      documentation: 'Provides tab completion.',
      parser,
      safeForSimultaneousRushProcesses: true
    });
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

  protected async runAsync(): Promise<void> {
    const commandLine: string = this._wordToCompleteParameter.value || '';
    const caretPosition: number = this._positionParameter.value || 0;

    for (const value of this.getCompletions(commandLine, caretPosition)) {
      console.log(value);
    }
  }

  public *getCompletions(commandLine: string, caretPosition: number): IterableIterator<string> {
    const actions: Map<string, Map<string, CommandLineParameter>> = new Map<
      string,
      Map<string, CommandLineParameter>
    >();

    this.parser.actions.forEach((element) => {
      const parameterNameToParameterInfoMap: Map<string, CommandLineParameter> = new Map<
        string,
        CommandLineParameter
      >();
      element.parameters.forEach((elem) => {
        parameterNameToParameterInfoMap[elem.longName] = elem;
        if (elem.shortName) {
          parameterNameToParameterInfoMap[elem.shortName] = elem;
        }
      });
      actions[element.actionName] = parameterNameToParameterInfoMap;
    });

    actions['-d'] = [];
    actions['--debug'] = [];
    actions['-h'] = [];
    actions['--help'] = [];

    if (!commandLine || !caretPosition) {
      yield* Object.keys(actions); // return all actions
      return;
    }

    const tokens: string[] = Array.from(this.tokenizeCommandLine(commandLine));

    const debugParameterUsed: boolean = tokens.length > 1 && (tokens[1] === '-d' || tokens[1] === '--debug');
    const debugParameterOffset: number = debugParameterUsed ? 1 : 0; // if debug switch is used, then offset everything by 1.

    if (tokens.length < 2 + debugParameterOffset) {
      yield* Object.keys(actions); // return all actions
      return;
    }

    const lastToken: string = tokens[tokens.length - 1];
    const secondLastToken: string = tokens[tokens.length - 2];

    const completePartialWord: boolean = caretPosition === commandLine.length;

    if (completePartialWord && tokens.length === 2 + debugParameterOffset) {
      for (const actionName of Object.keys(actions)) {
        if (actionName.indexOf(tokens[1 + debugParameterOffset]) === 0) {
          yield actionName;
        }
      }
    } else {
      for (const actionName of Object.keys(actions)) {
        if (actionName === tokens[1 + debugParameterOffset]) {
          if (actionName === 'build' || actionName === 'rebuild') {
            const choiceParameter: string[] = ['-f', '--from', '-t', '--to'];
            const choiceParameterValues: string[] = [];

            for (const project of this.rushConfiguration.projects) {
              choiceParameterValues.push(project.packageName);
            }

            const projectNamesToReturn: string[] = Array.from(
              this._getChoiceParameterValues(
                choiceParameter,
                choiceParameterValues,
                lastToken,
                secondLastToken,
                completePartialWord
              )
            );

            if (projectNamesToReturn.length > 0) {
              yield* projectNamesToReturn;
              return;
            }

            // TODO: Add support for version policy, variant
          }
          const parameterNameMap: Map<string, CommandLineParameter> = actions[actionName];

          const parameterNames: string[] = Array.from(Object.keys(actions[actionName]), (x: string) => x);

          for (const parameter of parameterNames) {
            if (parameterNameMap[parameter].kind === CommandLineParameterKind.Choice) {
              const choiceParameterValues: string[] = (parameterNameMap[
                parameter
              ] as CommandLineChoiceParameter).alternatives as string[];
              if (completePartialWord) {
                if (parameter === secondLastToken) {
                  yield* this._completeChoiceParameterValues(choiceParameterValues, lastToken);
                  return;
                }
              } else {
                if (parameter === lastToken) {
                  yield* choiceParameterValues;
                  return;
                }
              }
            }
          }

          if (completePartialWord) {
            yield* this._completeChoiceParameterValues(parameterNames, lastToken);
          } else {
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
        }
      }
    }
  }

  public tokenizeCommandLine(commandLine: string): string[] {
    return stringArgv(commandLine);
  }

  private *_getChoiceParameterValues(
    choiceParameter: string[],
    choiceParameterValues: string[],
    lastToken: string,
    secondLastToken: string,
    completePartialWord: boolean
  ): IterableIterator<string> {
    if (completePartialWord) {
      if (choiceParameter.indexOf(secondLastToken) !== -1) {
        yield* this._completeChoiceParameterValues(choiceParameterValues, lastToken);
      }
    } else {
      if (choiceParameter.indexOf(lastToken) !== -1) {
        yield* choiceParameterValues;
      }
    }
  }

  private *_completeChoiceParameterValues(
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
