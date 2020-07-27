// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { BaseRushAction } from './BaseRushAction';
import { RushCommandLineParser } from '../RushCommandLineParser';
import { CommandLineStringParameter, CommandLineIntegerParameter } from '@rushstack/ts-command-line';

export class TabCompleteAction extends BaseRushAction {
  private _wordToCompleteParameter: CommandLineStringParameter;
  private _positionParameter: CommandLineIntegerParameter;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'tab-complete',
      summary: 'Provides tab completion.',
      documentation: 'Provides tab completion',
      parser
    });
  }

  protected async run(): Promise<void> {
    this.parser.actions.forEach((element) => {
      console.log(element.actionName);
      element.parameters.forEach((elem) => {
        console.log(elem.longName);
        if (elem.shortName) {
          console.log(elem.shortName);
        }
      });
    });

    // console.log(this.parameters.join());
    // console.log(this.parser.actions.join());

    if (!this._wordToCompleteParameter.value) {
      return;
    }

    if (!this._positionParameter.value) {
      return;
    }
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
