// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
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
} from './MarkupElement';

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

  public static createPage(title: string): IMarkupPage {
    return {
      kind: 'page',
      breadcrumb: [],
      title: title,
      elements: []
    } as IMarkupPage;
  }
}
