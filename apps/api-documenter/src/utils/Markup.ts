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
  IMarkupHtmlTag,
  MarkupLinkTextElement,
  IMarkupNoteBox,
  IMarkupCodeBox,
  MarkupHighlighter
} from './MarkupElement';

/**
 * Options for {@link Markup.createTextElements}
 *
 * @public
 */
export interface IMarkupCreateTextOptions {
  /**
   * Whether the text should be boldfaced.
   */
  bold?: boolean;

  /**
   * Whether the text should be italicized.
   */
  italics?: boolean;
}

/**
 * Provides various operations for working with MarkupElement objects.
 *
 * @public
 */
export class Markup {
  /**
   * A predefined constant for the IMarkupLineBreak element.
   */
  public static BREAK: IMarkupLineBreak = {
    kind: 'break'
  };

  /**
   * A predefined constant for the IMarkupParagraph element.
   */
  public static PARAGRAPH: IMarkupParagraph = {
    kind: 'paragraph'
  };

  /**
   * Appends text content to the `output` array.  If the last item in the array is a
   * compatible IMarkupText element, the text will be merged into it.  Otherwise, a new
   * IMarkupText element will be created.
   */
  public static appendTextElements(output: MarkupElement[], text: string, options?: IMarkupCreateTextOptions): void  {
    if (text.length > 0) {
      if (output.length > 0) {
        const lastElement: MarkupElement = output[output.length - 1];
        if (lastElement.kind === 'text') {
          const lastTextElement: IMarkupText = lastElement as IMarkupText;
          if (!options) {
            options = { };
          }

          if ((!!lastTextElement.bold === !!options.bold)
            && (!!lastTextElement.italics === !!options.italics)) {
            lastTextElement.text += text;
            return;
          }
        }
      }

      // We can't append to the previous element, so start a new one
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
      output.push(result);
    }
  }

  /**
   * Constructs an IMarkupText element representing the specified text string, with
   * optional formatting.
   *
   * @remarks
   * NOTE: All whitespace (including newlines) will be collapsed to single spaces.
   * This behavior is similar to how HTML handles whitespace.  To preserve
   * newlines, use {@link Markup.createTextParagraphs} instead.
   */
  public static createTextElements(text: string, options?: IMarkupCreateTextOptions): IMarkupText[] {
    if (!text) {
      return [];
    } else {
      const result: IMarkupText = {
        kind: 'text',
        text: Markup._trimRawText(text)
      } as IMarkupText;

      if (options) {
        if (options.bold) {
          result.bold = true;
        }
        if (options.italics) {
          result.italics = true;
        }
      }

      // The return value is represented as an array containing at most one element.
      // Another possible design would be to return a single IMarkupText object that
      // is possibly undefined; however, in practice appending arrays turns out to be
      // more concise than checking for undefined.
      return [ result ];
    }
  }

  /**
   * This function is similar to {@link Markup.createTextElements}, except that multiple newlines
   * will be converted to a Markup.PARAGRAPH object.
   */
  public static createTextParagraphs(text: string, options?: IMarkupCreateTextOptions): MarkupBasicElement[] {
    const result: MarkupBasicElement[] = [];

    if (text) {
      // Split up the paragraphs
      for (const paragraph of text.split(/\n\s*\n/g)) {
        if (result.length > 0) {
          result.push(Markup.PARAGRAPH);
        }

        result.push(...Markup.createTextElements(paragraph, options));
      }
    }

    return result;
  }

  /**
   * Constructs an IMarkupApiLink element that represents a hyperlink to the specified
   * API object.  The hyperlink is applied to an existing stream of markup elements.
   * @param textElements - the markup sequence that will serve as the link text
   * @param target - the API object that the hyperlink will point to
   */
  public static createApiLink(textElements: MarkupLinkTextElement[], target: string): IMarkupApiLink {
    if (!textElements.length) {
      throw new Error('Missing text for link');
    }

    return {
      kind: 'api-link',
      elements: textElements,
      target: target
    } as IMarkupApiLink;
  }

  /**
   * Constructs an IMarkupApiLink element that represents a hyperlink to the specified
   * API object.  The hyperlink is applied to a plain text string.
   * @param text - the text string that will serve as the link text
   * @param target - the API object that the hyperlink will point to
   */
  public static createApiLinkFromText(text: string, target: string): IMarkupApiLink {
    return Markup.createApiLink(Markup.createTextElements(text), target);
  }

  /**
   * Constructs an IMarkupWebLink element that represents a hyperlink an internet URL.
   * @param textElements - the markup sequence that will serve as the link text
   * @param targetUrl - the URL that the hyperlink will point to
   */
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

  /**
   * Constructs an IMarkupWebLink element that represents a hyperlink an internet URL.
   * @param text - the plain text string that will serve as the link text
   * @param targetUrl - the URL that the hyperlink will point to
   */
  public static createWebLinkFromText(text: string, targetUrl: string): IMarkupWebLink {
    return Markup.createWebLink(Markup.createTextElements(text), targetUrl);
  }

  /**
   * Constructs an IMarkupHighlightedText element representing a program code text
   * with optional syntax highlighting
   */
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

  /**
   * Constructs an IMarkupHtmlTag element representing an opening or closing HTML tag.
   */
  public static createHtmlTag(token: string): IMarkupHtmlTag {
    if (token.length === 0) {
      throw new Error('The code parameter is missing');
    }
    return {
      kind: 'html-tag',
      token: token
    } as IMarkupHtmlTag;
  }

  /**
   * Constructs an IMarkupHeading1 element with the specified title text
   */
  public static createHeading1(text: string): IMarkupHeading1 {
    return {
      kind: 'heading1',
      text: Markup._trimRawText(text)
    };
  }

  /**
   * Constructs an IMarkupHeading2 element with the specified title text
   */
  public static createHeading2(text: string): IMarkupHeading2 {
    return {
      kind: 'heading2',
      text: Markup._trimRawText(text)
    };
  }

  /**
   * Constructs an IMarkupCodeBox element representing a program code text
   * with the specified syntax highlighting
   */
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

  /**
   * Constructs an IMarkupNoteBox element that will display the specified markup content
   */
  public static createNoteBox(textElements: MarkupBasicElement[]): IMarkupNoteBox {
    return {
      kind: 'note-box',
      elements: textElements
    } as IMarkupNoteBox;
  }

  /**
   * Constructs an IMarkupNoteBox element that will display the specified plain text string
   */
  public static createNoteBoxFromText(text: string): IMarkupNoteBox {
    return Markup.createNoteBox(Markup.createTextElements(text));
  }

  /**
   * Constructs an IMarkupTableRow element containing the specified cells, which each contain a
   * sequence of MarkupBasicElement content
   */
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

  /**
   * Constructs an IMarkupTable element containing the specified header cells, which each contain a
   * sequence of MarkupBasicElement content.
   * @remarks
   * The table initially has zero rows.
   */
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

  /**
   * Constructs an IMarkupTable element with the specified title.
   */
  public static createPage(title: string): IMarkupPage {
    return {
      kind: 'page',
      breadcrumb: [],
      title: Markup._trimRawText(title),
      elements: []
    } as IMarkupPage;
  }

  private static _trimRawText(text: string): string {
    // Replace multiple whitespaces with a single space
    return text.replace(/\s+/g, ' ');
  }
}
