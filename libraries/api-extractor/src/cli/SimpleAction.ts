// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  CommandLineAction
} from '@microsoft/ts-command-line';

import { ApiExtractorCommandLine } from './ApiExtractorCommandLine';

export class SimpleAction extends CommandLineAction {
  private _parser: ApiExtractorCommandLine;

  constructor(parser: ApiExtractorCommandLine) {
    super({
      actionVerb: 'simple',
      summary: 'Process loose *.d.ts files (without a project)',
      documentation: 'Use this command for very simple API Extractor usage scenarios'
    });
    this._parser = parser;
  }

  protected onDefineParameters(): void { // override

  }

  protected onExecute(): void { // override
    console.log('SIMPLE');
  }
}
