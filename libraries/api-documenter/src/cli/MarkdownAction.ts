// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  CommandLineAction
} from '@microsoft/ts-command-line';

import { ApiDocumenterCommandLine } from './ApiDocumenterCommandLine';

export class MarkdownAction extends CommandLineAction {
  private _parser: ApiDocumenterCommandLine;

  constructor(parser: ApiDocumenterCommandLine) {
    super({
      actionVerb: 'md',
      summary: 'Generate documentation as Markdown files (*.md)',
      documentation: 'Generate documentation as Markdown files (*.md)'
    });
    this._parser = parser;
  }

  protected onDefineParameters(): void { // override
    // No parameters
  }

  protected onExecute(): void { // override
    console.log('Markdown');
  }
}
