// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  IApiItemReference,
  IDocElement,
  ITextElement,
  ILinkDocElement,
  ISeeDocElement,
  MarkupBasicElement,
  IMarkupWebLink,
  IMarkupApiLink,
  IMarkupText,
  IMarkupParagraph,
  IMarkupLineBreak,
  IMarkupTable,
  IMarkupTableRow,
  IMarkupTableCell,
  IMarkupHeading1,
  IMarkupHeading2,
  IMarkupPage,
  IMarkupHighlightedText,
  MarkupLinkTextElement,
  IMarkupNoteBox,
  IMarkupCodeBox,
  MarkupHighlighter
} from '@microsoft/api-extractor';

/**
 * A helper class for generating MarkupElement structures.
 */
export class MarkupBuilder {
  public static BREAK: IMarkupLineBreak = {
    kind: 'break'
  };
  public static PARAGRAPH: IMarkupParagraph = {
    kind: 'paragraph'
  };

  public static createTextElements(text: string, options?: { bold?: boolean, italics?: boolean } ): IMarkupText[] {
    if (!text) {
      return [];
    } else {
      const result: IMarkupText = {
        kind: 'text',
        text: text
      } as IMarkupText;

      if (options) {
        if (options.bold) {
          result.bold = true;
        }
        if (options.italics) {
          result.italics = true;
        }
      }

      return [ result ];
    }
  }

  public static createApiLink(textElements: MarkupLinkTextElement[], target: IApiItemReference): IMarkupApiLink {
    if (!textElements.length) {
      throw new Error('Missing text for link');
    }

    return {
      kind: 'api-link',
      elements: textElements,
      target: target
    } as IMarkupApiLink;
  }

  public static createApiLinkFromText(text: string, target: IApiItemReference): IMarkupApiLink {
    return MarkupBuilder.createApiLink(MarkupBuilder.createTextElements(text), target);
  }

  public static createWebLink(textElements: MarkupLinkTextElement[], targetUrl: string): IMarkupWebLink {
    if (!textElements.length) {
      throw new Error('Missing text for link');
    }
    if (!targetUrl || !targetUrl.trim()) {
      throw new Error('Missing link target');
    }

    return {
      kind: 'web-link',
      elements: textElements,
      targetUrl: targetUrl
    };
  }

  public static createWebLinkFromText(text: string, targetUrl: string): IMarkupWebLink {
    return MarkupBuilder.createWebLink(MarkupBuilder.createTextElements(text), targetUrl);
  }

  public static createCode(code: string, highlighter?: MarkupHighlighter): IMarkupHighlightedText {
    if (!code) {
      throw new Error('The code parameter is missing');
    }
    return {
      kind: 'code',
      text: code,
      highlighter: highlighter || 'plain'
    } as IMarkupHighlightedText;
  }

  public static createHeading1(text: string): IMarkupHeading1 {
    return {
      kind: 'heading1',
      text: text
    };
  }

  public static createHeading2(text: string): IMarkupHeading2 {
    return {
      kind: 'heading2',
      text: text
    };
  }

  public static createCodeBox(code: string, highlighter: MarkupHighlighter): IMarkupCodeBox {
    if (!code) {
      throw new Error('The code parameter is missing');
    }
    return {
      kind: 'code-box',
      text: code,
      highlighter: highlighter
    } as IMarkupCodeBox;
  }

  public static createNoteBox(textElements: MarkupBasicElement[]): IMarkupNoteBox {
    return {
      kind: 'note-box',
      elements: textElements
    } as IMarkupNoteBox;
  }

  public static createNoteBoxFromText(text: string): IMarkupNoteBox {
    return MarkupBuilder.createNoteBox(MarkupBuilder.createTextElements(text));
  }

  public static createTableRow(cellValues: MarkupBasicElement[][] | undefined = undefined): IMarkupTableRow {
    const row: IMarkupTableRow = {
      kind: 'table-row',
      cells: []
    };

    if (cellValues) {
      for (const cellValue of cellValues) {
        const cell: IMarkupTableCell = {
          kind: 'table-cell',
          elements: cellValue
        };
        row.cells.push(cell);
      }
    }

    return row;
  }

  public static createTable(headerCellValues: MarkupBasicElement[][] | undefined = undefined): IMarkupTable {
    let header: IMarkupTableRow | undefined = undefined;
    if (headerCellValues) {
      header = MarkupBuilder.createTableRow(headerCellValues);
    }
    return {
      kind: 'table',
      header: header,
      rows: []
    } as IMarkupTable;
  }

  public static createPage(title: string, docId: string): IMarkupPage {
    return {
      kind: 'page',
      docId: docId,
      breadcrumb: [],
      title: title,
      elements: []
    } as IMarkupPage;
  }

  public static renderDocElements(docElements: IDocElement[] | undefined): MarkupBasicElement[] {
    if (!docElements) {
      return [];
    }

    const result: MarkupBasicElement[] = [];

    for (const docElement of docElements || []) {
      switch (docElement.kind) {
        case 'textDocElement':
          const textDocElement: ITextElement = docElement as ITextElement;
          result.push(...MarkupBuilder.createTextElements(textDocElement.value));
          break;
        case 'paragraphDocElement':
          result.push(MarkupBuilder.PARAGRAPH);
          break;
        case 'linkDocElement':
          const linkDocElement: ILinkDocElement = docElement as ILinkDocElement;
          if (linkDocElement.referenceType === 'code') {
            let linkText: string | undefined = linkDocElement.value;
            if (!linkText) {
              linkText = linkDocElement.exportName;
              if (linkDocElement.memberName) {
                linkText += '.' + linkDocElement.memberName;
              }
            }
            result.push(
              MarkupBuilder.createApiLinkFromText(linkText,
                {
                  scopeName: linkDocElement.scopeName || '',
                  packageName: linkDocElement.packageName || '',
                  exportName: linkDocElement.exportName || '',
                  memberName: linkDocElement.memberName || ''
                }
              )
            );
          } else {
            result.push(
              {
                kind: 'web-link',
                elements: MarkupBuilder.createTextElements(linkDocElement.value || linkDocElement.targetUrl),
                targetUrl: linkDocElement.targetUrl
              } as IMarkupWebLink
            );
          }
          break;
        case 'seeDocElement':
          const seeDocElement: ISeeDocElement = docElement as ISeeDocElement;
          // This representation should probably be improved later.
          result.push(
            ...MarkupBuilder.createTextElements('see ')
          );
          result.push(...MarkupBuilder.renderDocElements(seeDocElement.seeElements));
          break;
      }
    }

    return result;
  }
}
