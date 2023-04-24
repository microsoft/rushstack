// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See the @microsoft/rush package's LICENSE file for license information.

import { CommandLineParser } from '@rushstack/ts-command-line';

import { ReadmeAction } from './ReadmeAction';
import { RecordVersionsAction } from './RecordVersionsAction';
import { BumpCyclicsAction } from './BumpCyclicsAction';

export class ToolboxCommandLine extends CommandLineParser {
  public constructor() {
    super({
      toolFilename: 'toolbox',
      toolDescription: 'Used to execute various operations specific to this repo'
    });

    this.addAction(new ReadmeAction());
    this.addAction(new RecordVersionsAction());
    this.addAction(new BumpCyclicsAction());
  }
}
