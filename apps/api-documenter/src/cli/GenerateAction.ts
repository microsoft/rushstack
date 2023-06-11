// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiDocumenterCommandLine } from './ApiDocumenterCommandLine';
import { BaseAction } from './BaseAction';
import { DocumenterConfig } from '../documenters/DocumenterConfig';
import { ExperimentalYamlDocumenter } from '../documenters/ExperimentalYamlDocumenter';

import { MarkdownDocumenter } from '../documenters/MarkdownDocumenter';

export class GenerateAction extends BaseAction {
  public constructor(parser: ApiDocumenterCommandLine) {
    super({
      actionName: 'generate',
      summary: 'EXPERIMENTAL',
      documentation:
        'EXPERIMENTAL - This action is a prototype of a new config file driven mode of operation for' +
        ' API Documenter.  It is not ready for general usage yet.  Its design may change in the future.'
    });
  }

  protected async onExecute(): Promise<void> {
    // override
    // Look for the config file under the current folder

    const documenterConfig: DocumenterConfig = await DocumenterConfig.loadFileAsync(process.cwd());

    const { apiModel, outputFolder } = this.buildApiModel();

    if (documenterConfig.configFile.outputTarget === 'markdown') {
      const markdownDocumenter: MarkdownDocumenter = new MarkdownDocumenter({
        apiModel,
        documenterConfig,
        outputFolder
      });
      markdownDocumenter.generateFiles();
    } else {
      const yamlDocumenter: ExperimentalYamlDocumenter = new ExperimentalYamlDocumenter(
        apiModel,
        documenterConfig
      );
      yamlDocumenter.generateFiles(outputFolder);
    }
  }
}
