// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ApiDocumenterCommandLine } from './ApiDocumenterCommandLine.ts';
import { BaseAction } from './BaseAction.ts';
import { MarkdownDocumenter } from '../documenters/MarkdownDocumenter.ts';

export class MarkdownAction extends BaseAction {
  public constructor(parser: ApiDocumenterCommandLine) {
    super({
      actionName: 'markdown',
      summary: 'Generate documentation as Markdown files (*.md)',
      documentation:
        'Generates API documentation as a collection of files in' +
        ' Markdown format, suitable for example for publishing on a GitHub site.'
    });
  }

  protected override async onExecuteAsync(): Promise<void> {
    const { apiModel, outputFolder } = this.buildApiModel();

    const markdownDocumenter: MarkdownDocumenter = new MarkdownDocumenter({
      apiModel,
      documenterConfig: undefined,
      outputFolder
    });
    markdownDocumenter.generateFiles();
  }
}
