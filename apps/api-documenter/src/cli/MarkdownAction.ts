// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiDocumenterCommandLine } from './ApiDocumenterCommandLine';
import { BaseAction } from './BaseAction';
import { MarkdownDocumenter } from '../documenters/MarkdownDocumenter';
import { DocumenterConfig } from '../documenters/DocumenterConfig';

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

  protected async onExecute(): Promise<void> {
    const documenterConfig: DocumenterConfig | undefined =
      await DocumenterConfig.tryLoadFileFromDefaultLocationsAsync(process.cwd());
    if (!documenterConfig) {
      console.log(
        `Did not find a ${DocumenterConfig.FILENAME} in the current folder or in a "config" subfolder`
      );
    }

    const { apiModel, outputFolder } = this.buildApiModel();
    const markdownDocumenter: MarkdownDocumenter = new MarkdownDocumenter({
      apiModel,
      documenterConfig,
      outputFolder
    });
    markdownDocumenter.generateFiles();
  }
}
