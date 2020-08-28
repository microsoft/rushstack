// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiDocumenterCommandLine } from './ApiDocumenterCommandLine';
import { BaseAction } from './BaseAction';
import { MarkdownDocumenter } from '../documenters/MarkdownDocumenter';
import { ApiModel } from '@microsoft/api-extractor-model';

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

  protected onExecute(): Promise<void> {
    // override
    const apiModel: ApiModel = this.buildApiModel();

    const markdownDocumenter: MarkdownDocumenter = new MarkdownDocumenter(apiModel, undefined);
    markdownDocumenter.generateFiles(this.outputFolder);
    return Promise.resolve();
  }
}
