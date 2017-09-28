// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as path from 'path';

import { IMarkupPage } from '@microsoft/api-extractor';
import { BasePageRenderer } from './BasePageRenderer';
import { DocumentationNode } from './DocumentationNode';
import { MarkdownRenderer, IMarkdownRenderApiLinkArgs } from './MarkdownRenderer';

/**
 * Renders API documentation in the Markdown file format.
 * For more info:  https://en.wikipedia.org/wiki/Markdown
 */
export class MarkdownPageRenderer extends BasePageRenderer {
  public get outputFileExtension(): string { // override
    return '.md';
  }

  public writePage(markupPage: IMarkupPage): string { // override
    const filename: string = path.join(this.outputFolder, this.getFilenameForDocId(markupPage.docId));

    const content: string = MarkdownRenderer.renderElements([markupPage], {
      onRenderApiLink: (args: IMarkdownRenderApiLinkArgs) => {
        const docId: string = DocumentationNode.getDocIdForCodeLink(args.reference);
        const docFilename: string = this.getFilenameForDocId(docId);
        args.prefix = '[';
        args.suffix = '](' + docFilename + ')';
      }
    });

    fsx.writeFileSync(filename, content);

    return filename;
  }
}
