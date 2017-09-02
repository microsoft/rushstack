// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  IDocElement,
  ITextElement,
  ILinkDocElement,
  ISeeDocElement,
  MarkupBasicElement,
  IMarkupDocumentationLink,
  IMarkupWebLink,
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

import { DocumentationNode } from './DocumentationNode';

/**
 * A helper class for generating MarkupElement structures.
 */
export class Domifier {
  public static BREAK: IMarkupLineBreak = {
    kind: 'break'
  };
  public static PARAGRAPH: IMarkupParagraph = {
    kind: 'paragraph'
  };

  public static createTextElements(text: string, options?: { bold?: boolean, italics?: boolean } ): IMarkupText[] {
    const trimmed: string = text;
    if (!trimmed) {
      return [];
    } else {
      const result: IMarkupText = {
        kind: 'text',
        text: trimmed
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

  public static createDocumentationLink(textElements: MarkupLinkTextElement[],
    targetDocId: string): IMarkupDocumentationLink {

    if (!textElements.length) {
      throw new Error('Missing text for doc link');
    }

    return {
      kind: 'doc-link',
      elements: textElements,
      targetDocId: targetDocId
    } as IMarkupDocumentationLink;
  }

  public static createDocumentationLinkFromText(text: string, targetDocId: string): IMarkupDocumentationLink {
    if (!text) {
      throw new Error('Missing text for doc link');
    }

    return Domifier.createDocumentationLink(Domifier.createTextElements(text), targetDocId);
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
    return Domifier.createNoteBox(Domifier.createTextElements(text));
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
      header = Domifier.createTableRow(headerCellValues);
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
          result.push(...Domifier.createTextElements(textDocElement.value));
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
              Domifier.createDocumentationLinkFromText(linkText,
                DocumentationNode.getDocIdForCodeLink(linkDocElement)
              )
            );
          } else {
            result.push(
              {
                kind: 'web-link',
                elements: Domifier.createTextElements(linkDocElement.value || linkDocElement.targetUrl),
                targetUrl: linkDocElement.targetUrl
              } as IMarkupWebLink
            );
          }
          break;
        case 'seeDocElement':
          const seeDocElement: ISeeDocElement = docElement as ISeeDocElement;
          // This representation should probably be improved later.
          result.push(
            ...Domifier.createTextElements('see ')
          );
          result.push(...Domifier.renderDocElements(seeDocElement.seeElements));
          break;
      }
    }

    return result;
  }
}
