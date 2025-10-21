// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineParser } from '@rushstack/ts-command-line';

import { ReadmeAction } from './actions/ReadmeAction';
import { RecordVersionsAction } from './actions/RecordVersionsAction';
import { BumpDecoupledLocalDependencies } from './actions/BumpDecoupledLocalDependencies';

export class ToolboxCommandLine extends CommandLineParser {
  public constructor() {
    super({
      toolFilename: 'toolbox',
      toolDescription: 'Used to execute various operations specific to this repo'
    });

    this.addAction(new ReadmeAction());
    this.addAction(new RecordVersionsAction());
    this.addAction(new BumpDecoupledLocalDependencies());
  }
}
