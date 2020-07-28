// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { BaseRushAction } from './BaseRushAction';
import { RushCommandLineParser } from '../RushCommandLineParser';
import { CommandLineStringParameter, CommandLineIntegerParameter } from '@rushstack/ts-command-line';

export class TabCompleteAction extends BaseRushAction {
  private _wordToCompleteParameter: CommandLineStringParameter;
  private _positionParameter: CommandLineIntegerParameter;

  private static _actions: string[] = [];

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'tab-complete',
      summary: 'Provides tab completion.',
      documentation: 'Provides tab completion',
      parser,
      safeForSimultaneousRushProcesses: true
    });

    this.parser.actions.forEach((element) => {
      TabCompleteAction._actions.push(element.actionName);
    });
    TabCompleteAction._actions.push('-d');
    TabCompleteAction._actions.push('-debug');
    TabCompleteAction._actions.push('-h');
    TabCompleteAction._actions.push('-help');
  }

  protected async run(): Promise<void> {
    // console.log('arg count: ' + process.argv.length);

    // for (let i: number = 0; i < process.argv.length; i++) {
    //   console.log(i + ': ' + process.argv[i] + ' [' + process.argv[i].length + ']');
    // }

    if (!this._wordToCompleteParameter.value || !this._positionParameter.value) {
      this._printAllActions();
      return;
    }

    const commandLine: string = this._wordToCompleteParameter.value;
    const caretPosition: number = this._positionParameter.value;
    const commands: string[] = commandLine.split(' ');

    if (commands.length < 2) {
      this._printAllActions();
      return;
    }

    // console.log('commands.length: ' + commands.length);
    // console.log('caretPosition: ' + caretPosition);
    // console.log('commandLine.length: ' + commandLine.length);

    if (commands.length === 2 && caretPosition === commandLine.length) {
      for (let i: number = 0; i < TabCompleteAction._actions.length; i++) {
        // console.log('TabCompleteAction._actions[' + i + ']: ' + TabCompleteAction._actions[i] + ', commands[1]: ' + commands[1]);
        if (TabCompleteAction._actions[i].indexOf(commands[1]) === 0) {
          console.log(TabCompleteAction._actions[i]);
        }
      }

      return;
    }

    if (this._wordToCompleteParameter.value) {
      console.log('wordToComplete: ' + this._wordToCompleteParameter.value);
    }

    if (this._positionParameter.value) {
      console.log('position: ' + this._positionParameter.value);
    }
  }

  private _printAllActions(): void {
    TabCompleteAction._actions.forEach((element) => {
      console.log(element);
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
}
