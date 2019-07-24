// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  CommandLineAction
} from '@microsoft/ts-command-line';

import { Terminal } from '@microsoft/node-core-library';
import { RushConfiguration } from '@microsoft/rush-lib';

import { BxlModulesGenerator } from '../../logic/BxlModulesGenerator';

export class GenerateAction extends CommandLineAction {
  private _terminal: Terminal;

  constructor(terminal: Terminal) {
    super({
      actionName: 'generate',
      summary: 'Generates a BuildXL configuration for the current Rush repository.',
      documentation: 'Generates a BuildXL configuration for the current Rush repository.'
    });

    this._terminal = terminal;
  }

  public onDefineParameters(): void {
    /* This action doesn't take any parameters*/
  }

  protected async onExecute(): Promise<void> {

    if (process.env.BUILDXL_BIN === undefined) {
      throw new Error('Environment variable BUILDXL_BIN not defined');
    }

    const generator: BxlModulesGenerator =
        new BxlModulesGenerator(
          RushConfiguration.loadFromDefaultLocation(),
          process.env.BUILDXL_BIN);

    if (!generator.run()) {
      this._terminal.writeErrorLine('Error generating bxl scripts');
      return;
    }

    this._terminal.writeLine(`Successfully generated BuildXL configuration.`);
  }
}
