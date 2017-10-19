// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiDocumenterCommandLine } from './ApiDocumenterCommandLine';
import { BaseAction } from './BaseAction';
import { DocItemSet } from '../DocItemSet';
import { MarkdownGenerator } from '../markdown/MarkdownGenerator';

export class MarkdownAction extends BaseAction {
  constructor(parser: ApiDocumenterCommandLine) {
    super({
      actionVerb: 'markdown',
      summary: 'Generate documentation as Markdown files (*.md)',
      documentation: 'Generate documentation as Markdown files (*.md)'
    });
  }

  protected onExecute(): void { // override
    const docItemSet: DocItemSet = this.buildDocItemSet();
    const markdownGenerator: MarkdownGenerator = new MarkdownGenerator(docItemSet);
    markdownGenerator.generateFiles(this.outputFolder);
  }
}
