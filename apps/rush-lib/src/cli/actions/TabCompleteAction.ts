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

export class TabCompleteAction extends BaseRushAction {
  private _wordToCompleteParameter: CommandLineStringParameter;
  private _positionParameter: CommandLineIntegerParameter;

  private static _actions: { [actionName: string]: IParameter[] } = {};

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'tab-complete',
      summary: 'Provides tab completion.',
      documentation: 'Provides tab completion',
      parser,
      safeForSimultaneousRushProcesses: true
    });
  }

  protected onDefineParameters(): void {
    this._wordToCompleteParameter = this.defineStringParameter({
      parameterLongName: '--word',
      argumentName: 'WORD',
      description: `The word to complete.`
    });

    this._positionParameter = this.defineIntegerParameter({
      parameterLongName: '--position',
      argumentName: 'INDEX',
      description: `The position in the word to be completed.`
    });
  }

  protected async run(): Promise<void> {
    const commandLine: string = this._wordToCompleteParameter.value || '';
    const caretPosition: number = this._positionParameter.value || 0;

    for (const value of this._getCompletions(commandLine, caretPosition)) {
      console.log(value);
    }
  }

  public *_getCompletions(commandLine: string, caretPosition: number): IterableIterator<string> {
    this.parser.actions.forEach((element) => {
      const actionParameters: IParameter[] = [];
      element.parameters.forEach((elem) => {
        actionParameters.push({ name: elem.longName, kind: elem.kind });
        if (elem.shortName) {
          actionParameters.push({ name: elem.shortName, kind: elem.kind });
        }
      });
      TabCompleteAction._actions[element.actionName] = actionParameters;
    });

    TabCompleteAction._actions['-d'] = [];
    TabCompleteAction._actions['--debug'] = [];
    TabCompleteAction._actions['-h'] = [];
    TabCompleteAction._actions['--help'] = [];

    // yield ('arg count: ' + process.argv.length);

    // for (let i: number = 0; i < process.argv.length; i++) {
    //   yield (i + ': ' + process.argv[i] + ' [' + process.argv[i].length + ']');
    // }

    if (!commandLine || !caretPosition) {
      yield* this._getAllActions();
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
      yield* this._getAllActions();
      return;
    }

    const lastCommand: string = commands[commands.length - 1];
    const secondLastCommand: string = commands[commands.length - 2];
    // yield ('lastCommand: ' + lastCommand);
    // yield ('secondLastCommand: ' + secondLastCommand);

    const completePartialWord: boolean = caretPosition === commandLine.length;

    if (completePartialWord && commands.length === 2 + debugParameterOffset) {
      for (const actionName of Object.keys(TabCompleteAction._actions)) {
        if (actionName.indexOf(commands[1 + debugParameterOffset]) === 0) {
          yield actionName;
        }
      }
    } else {
      for (const actionName of Object.keys(TabCompleteAction._actions)) {
        if (actionName === commands[1 + debugParameterOffset]) {
          if (actionName === 'build' || actionName === 'rebuild') {
            const projectCommands: string[] = ['-f', '--from', '-t', '--to'];
            if (completePartialWord) {
              if (projectCommands.indexOf(secondLastCommand) !== -1) {
                for (let i: number = 0; i < this.rushConfiguration.projects.length; i++) {
                  if (this.rushConfiguration.projects[i].packageName.indexOf(lastCommand) === 0) {
                    yield this.rushConfiguration.projects[i].packageName;
                  }
                }

                return;
              }
            } else {
              if (projectCommands.indexOf(lastCommand) !== -1) {
                for (let i: number = 0; i < this.rushConfiguration.projects.length; i++) {
                  yield this.rushConfiguration.projects[i].packageName;
                }

                return;
              }
            }
            // TODO: Add support for version policy, variant
          } else if (actionName === 'change') {
            const bumpTypes: string[] = ['major', 'minor', 'patch', 'none'];
            if (completePartialWord) {
              if (secondLastCommand === '--bump-type') {
                for (let i: number = 0; i < bumpTypes.length; i++) {
                  if (bumpTypes[i].indexOf(lastCommand) === 0) {
                    yield bumpTypes[i];
                  }
                }

                return;
              }
            } else {
              if (lastCommand === '--bump-type') {
                for (let i: number = 0; i < bumpTypes.length; i++) {
                  yield bumpTypes[i];
                }

                return;
              }
            }
          } else if (actionName === 'publish') {
            const accessLevels: string[] = ['public', 'restricted'];
            if (completePartialWord) {
              if (secondLastCommand === '--set-access-level') {
                for (let i: number = 0; i < accessLevels.length; i++) {
                  if (accessLevels[i].indexOf(lastCommand) === 0) {
                    yield accessLevels[i];
                  }
                }

                return;
              }
            } else {
              if (lastCommand === '--set-access-level') {
                for (let i: number = 0; i < accessLevels.length; i++) {
                  yield accessLevels[i];
                }

                return;
              }
            }
          }

          if (completePartialWord) {
            for (let i: number = 0; i < TabCompleteAction._actions[actionName].length; i++) {
              if (TabCompleteAction._actions[actionName][i].name.indexOf(lastCommand) === 0) {
                yield TabCompleteAction._actions[actionName][i].name;
              }
            }
          } else {
            for (let i: number = 0; i < TabCompleteAction._actions[actionName].length; i++) {
              if (
                lastCommand === TabCompleteAction._actions[actionName][i].name &&
                TabCompleteAction._actions[actionName][i].kind !== CommandLineParameterKind.Flag
              ) {
                // The parameter is expecting a value, so don't suggest parameter names again
                return;
              }
            }

            for (let i: number = 0; i < TabCompleteAction._actions[actionName].length; i++) {
              yield TabCompleteAction._actions[actionName][i].name;
            }
          }
        }
      }
    }
  }

  private *_getAllActions(): IterableIterator<string> {
    for (const actionName of Object.keys(TabCompleteAction._actions)) {
      yield actionName;
    }
  }
}
