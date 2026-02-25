// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineParser } from '@rushstack/ts-command-line';
import { ConsoleTerminalProvider, type ITerminal, Terminal } from '@rushstack/terminal';

import { ReadmeAction } from './actions/ReadmeAction.js';
import { RecordVersionsAction } from './actions/RecordVersionsAction.js';
import { BumpDecoupledLocalDependencies } from './actions/BumpDecoupledLocalDependencies.js';
import { CollectProjectFilesAction } from './actions/CollectProjectFilesAction.js';

export class ToolboxCommandLine extends CommandLineParser {
  public constructor() {
    super({
      toolFilename: 'toolbox',
      toolDescription: 'Used to execute various operations specific to this repo'
    });

    const terminal: ITerminal = new Terminal(new ConsoleTerminalProvider());

    this.addAction(new ReadmeAction(terminal));
    this.addAction(new RecordVersionsAction(terminal));
    this.addAction(new BumpDecoupledLocalDependencies(terminal));
    this.addAction(new CollectProjectFilesAction(terminal));
  }
}
