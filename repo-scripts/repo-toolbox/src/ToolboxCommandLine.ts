// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See the @microsoft/rush package's LICENSE file for license information.

import { CommandLineParser } from '@rushstack/ts-command-line';
import { ReadmeAction } from './ReadmeAction';

export class ToolboxCommandLine extends CommandLineParser {
  public constructor() {
    super({
      toolFilename: 'toolbox',
      toolDescription: 'Used to execute various operations specific to this repo'
    });

    this.addAction(new ReadmeAction());
  }

  protected onDefineParameters(): void {
    // abstract
  }

  protected onExecute(): Promise<void> {
    // override
    return super.onExecute();
  }
}
