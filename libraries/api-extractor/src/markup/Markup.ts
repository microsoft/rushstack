// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  MarkupElement,
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
export class Markup {
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
    return Markup.createApiLink(Markup.createTextElements(text), target);
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
    return Markup.createWebLink(Markup.createTextElements(text), targetUrl);
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
    return Markup.createNoteBox(Markup.createTextElements(text));
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
      header = Markup.createTableRow(headerCellValues);
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

  /**
   * Extracts plain text from the provided markup elements, discarding any formatting.
   *
   * @remarks
   * The returned string is suitable for counting words or extracting search keywords.
   * Its formatting is not guaranteed, and may change in future updates of this API.
   *
   * API Extractor determines whether an API is "undocumented" by using extractTextContent()
   * to extract the text from its summary, and then counting the number of words.
   */
  public static extractTextContent(elements: MarkupElement[]): string {
    // Pass a buffer, since "+=" uses less memory than "+"
    const buffer: { text: string } = { text: '' };
    Markup._extractTextContent(elements, buffer);
    return buffer.text;
  }

  private static _extractTextContent(elements: MarkupElement[], buffer: { text: string }): void {
    for (const element of elements) {
      switch (element.kind) {
        case 'api-link':
          buffer.text += Markup.extractTextContent(element.elements);
          break;
        case 'break':
          buffer.text += '\n';
          break;
        case 'code':
        case 'code-box':
          break;
        case 'heading1':
        case 'heading2':
          buffer.text += element.text;
          break;
        case 'note-box':
          buffer.text += Markup.extractTextContent(element.elements);
          break;
        case 'page':
          buffer.text += element.title + '\n';
          buffer.text += Markup.extractTextContent(element.elements);
          break;
        case 'paragraph':
          buffer.text += '\n\n';
          break;
        case 'table':
          buffer.text += Markup.extractTextContent([element.header])
            + Markup.extractTextContent(element.rows);
          break;
        case 'table-cell':
          buffer.text += Markup.extractTextContent(element.elements);
          buffer.text += '\n';
          break;
        case 'table-row':
          buffer.text += Markup.extractTextContent(element.cells);
          buffer.text += '\n';
          break;
        case 'text':
          buffer.text += element.text;
          break;
        case 'web-link':
          buffer.text += Markup.extractTextContent(element.elements);
          break;
        default:
          throw new Error('Unsupported element kind');
      }
    }
  }
}
