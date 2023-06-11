// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiDocumenterCommandLine } from './ApiDocumenterCommandLine';
import { BaseAction } from './BaseAction';
import { MarkdownDocumenter } from '../documenters/MarkdownDocumenter';
import path from 'path';
import { DocumenterConfig } from '../documenters/DocumenterConfig';
import { FileSystem } from '@rushstack/node-core-library';

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
    let configFilePath: string = path.join(process.cwd(), DocumenterConfig.FILENAME);

    // First try the current folder
    if (!FileSystem.exists(configFilePath)) {
      // Otherwise try the standard "config" subfolder
      configFilePath = path.join(process.cwd(), 'config', DocumenterConfig.FILENAME);
      if (!FileSystem.exists(configFilePath)) {
        console.warn(
          `Unable to find ${DocumenterConfig.FILENAME} in the current folder or in a "config" subfolder`
        );
        configFilePath = undefined;
      }
    }

    const documenterConfig: DocumenterConfig = configFilePath ? DocumenterConfig.loadFile(configFilePath) : undefined;
    const { apiModel, outputFolder } = this.buildApiModel();

    const markdownDocumenter: MarkdownDocumenter = new MarkdownDocumenter({
      apiModel,
      documenterConfig,
      outputFolder
    });
    markdownDocumenter.generateFiles();
  }
}
