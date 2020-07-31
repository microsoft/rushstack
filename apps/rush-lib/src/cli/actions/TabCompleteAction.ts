// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { BaseRushAction } from './BaseRushAction';
import { RushCommandLineParser } from '../RushCommandLineParser';

import {
  CommandLineStringParameter,
  CommandLineIntegerParameter,
  CommandLineParameterKind
} from '@rushstack/ts-command-line';

interface IParameter {
  name: string;
  kind: CommandLineParameterKind;
}

const DEFAULT_WORD_TO_AUTOCOMPLETE: string = '';
const DEFAULT_POSITION: number = 0;

interface IActionMap {
  [actionName: string]: IParameter[];
}

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

    for (const value of this._getCompletions(commandLine, caretPosition)) {
      console.log(value);
    }
  }

  public *_getCompletions(commandLine: string, caretPosition: number): IterableIterator<string> {
    const actions: IActionMap = {};
    this.parser.actions.forEach((element) => {
      const actionParameters: IParameter[] = [];
      element.parameters.forEach((elem) => {
        actionParameters.push({ name: elem.longName, kind: elem.kind });
        if (elem.shortName) {
          actionParameters.push({ name: elem.shortName, kind: elem.kind });
        }
      });
      actions[element.actionName] = actionParameters;
    });

    actions['-d'] = [];
    actions['--debug'] = [];
    actions['-h'] = [];
    actions['--help'] = [];

    // yield ('arg count: ' + process.argv.length);

    // for (let i: number = 0; i < process.argv.length; i++) {
    //   yield (i + ': ' + process.argv[i] + ' [' + process.argv[i].length + ']');
    // }

    if (!commandLine || !caretPosition) {
      yield* Object.keys(actions); // return all actions
      return;
    }

    const commands: string[] = commandLine.split(' ');

    // yield ('commandLine: ' + commandLine);
    // yield ('commandLine.length: ' + commandLine.length);
    // yield ('caretPosition: ' + caretPosition);
    // yield ('commands.length: ' + commands.length);

    const debugParameterUsed: boolean =
      commands.length > 1 && (commands[1] === '-d' || commands[1] === '--debug');
    const debugParameterOffset: number = debugParameterUsed ? 1 : 0; // if debug switch is used, then offset everything by 1.

    if (commands.length < 2 + debugParameterOffset) {
      yield* Object.keys(actions); // return all actions
      return;
    }

    const lastCommand: string = commands[commands.length - 1];
    const secondLastCommand: string = commands[commands.length - 2];
    // yield ('lastCommand: ' + lastCommand);
    // yield ('secondLastCommand: ' + secondLastCommand);

    const completePartialWord: boolean = caretPosition === commandLine.length;

    if (completePartialWord && commands.length === 2 + debugParameterOffset) {
      for (const actionName of Object.keys(actions)) {
        if (actionName.indexOf(commands[1 + debugParameterOffset]) === 0) {
          yield actionName;
        }
      }
    } else {
      for (const actionName of Object.keys(actions)) {
        if (actionName === commands[1 + debugParameterOffset]) {
          if (actionName === 'build' || actionName === 'rebuild') {
            const choiceParameter: string[] = ['-f', '--from', '-t', '--to'];
            const choiceParameterValues: string[] = [];
            for (let i: number = 0; i < this.rushConfiguration.projects.length; i++) {
              choiceParameterValues.push(this.rushConfiguration.projects[i].packageName);
            }
            yield* this._getChoiceParameterValues(
              choiceParameter,
              choiceParameterValues,
              lastCommand,
              secondLastCommand,
              completePartialWord
            );

            // TODO: Add support for version policy, variant
          } else if (actionName === 'change') {
            const choiceParameter: string[] = ['--bump-type'];
            const choiceParameterValues: string[] = ['major', 'minor', 'patch', 'none'];
            yield* this._getChoiceParameterValues(
              choiceParameter,
              choiceParameterValues,
              lastCommand,
              secondLastCommand,
              completePartialWord
            );
          } else if (actionName === 'publish') {
            const choiceParameter: string[] = ['--set-access-level'];
            const choiceParameterValues: string[] = ['public', 'restricted'];
            yield* this._getChoiceParameterValues(
              choiceParameter,
              choiceParameterValues,
              lastCommand,
              secondLastCommand,
              completePartialWord
            );
          }

          if (completePartialWord) {
            for (let i: number = 0; i < actions[actionName].length; i++) {
              if (actions[actionName][i].name.indexOf(lastCommand) === 0) {
                yield actions[actionName][i].name;
              }
            }
          } else {
            for (let i: number = 0; i < actions[actionName].length; i++) {
              if (
                lastCommand === actions[actionName][i].name &&
                actions[actionName][i].kind !== CommandLineParameterKind.Flag
              ) {
                // The parameter is expecting a value, so don't suggest parameter names again
                return;
              }
            }

            for (let i: number = 0; i < actions[actionName].length; i++) {
              yield actions[actionName][i].name;
            }
          }
        }
      }
    }
  }

  private *_getChoiceParameterValues(
    choiceParameter: string[],
    choiceParamaterValues: string[],
    lastCommand: string,
    secondLastCommand: string,
    completePartialWord: boolean
  ): IterableIterator<string> {
    if (completePartialWord) {
      if (choiceParameter.indexOf(secondLastCommand) !== -1) {
        for (let i: number = 0; i < choiceParamaterValues.length; i++) {
          if (choiceParamaterValues[i].indexOf(lastCommand) === 0) {
            yield choiceParamaterValues[i];
          }
        }
      }
    } else {
      if (choiceParameter.indexOf(lastCommand) !== -1) {
        yield* choiceParamaterValues;
      }
    }
  }
}
