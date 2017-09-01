// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  IDocElement,
  ITextElement,
  ILinkDocElement,
  ISeeDocElement,
  DomBasicText,
  IDomDocumentationLink,
  IDomWebLink,
  IDomText,
  IDomParagraph,
  IDomLineBreak,
  IDomTable,
  IDomTableRow,
  IDomTableCell,
  IDomHeading1,
  IDomHeading2,
  IDomPage,
  IDomCode,
  DomLinkText,
  IDomNoteBox,
  IDomCodeBox,
  DomCodeHighlighter
} from '@microsoft/api-extractor';

import { DocumentationNode } from './DocumentationNode';

/**
 * A helper class for generating DomElement structures.
 */
export class Domifier {
  public static BREAK: IDomLineBreak = {
    kind: 'break'
  };
  public static PARAGRAPH: IDomParagraph = {
    kind: 'paragraph'
  };

  public static createTextElements(text: string, options?: { bold?: boolean, italics?: boolean } ): IDomText[] {
    const trimmed: string = text;
    if (!trimmed) {
      return [];
    } else {
      const result: IDomText = {
        kind: 'text',
        content: trimmed
      } as IDomText;

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

  public static createDocumentationLink(textElements: DomLinkText[], targetDocId: string): IDomDocumentationLink {
    if (!textElements.length) {
      throw new Error('Missing text for doc link');
    }

    return {
      kind: 'doc-link',
      elements: textElements,
      targetDocId: targetDocId
    } as IDomDocumentationLink;
  }

  public static createDocumentationLinkFromText(text: string, targetDocId: string): IDomDocumentationLink {
    if (!text) {
      throw new Error('Missing text for doc link');
    }

    return Domifier.createDocumentationLink(Domifier.createTextElements(text), targetDocId);
  }

  public static createCode(code: string, highlighter?: DomCodeHighlighter): IDomCode {
    if (!code) {
      throw new Error('The code parameter is missing');
    }
    return {
      kind: 'code',
      code: code,
      highlighter: highlighter || 'plain'
    } as IDomCode;
  }

  public static createHeading1(text: string): IDomHeading1 {
    return {
      kind: 'heading1',
      text: text
    };
  }

  public static createHeading2(text: string): IDomHeading2 {
    return {
      kind: 'heading2',
      text: text
    };
  }

  public static createCodeBox(code: string, highlighter: DomCodeHighlighter): IDomCodeBox {
    if (!code) {
      throw new Error('The code parameter is missing');
    }
    return {
      kind: 'code-box',
      code: code,
      highlighter: highlighter
    } as IDomCodeBox;
  }

  public static createNoteBox(textElements: DomBasicText[]): IDomNoteBox {
    return {
      kind: 'note-box',
      elements: textElements
    } as IDomNoteBox;
  }

  public static createNoteBoxFromText(text: string): IDomNoteBox {
    return Domifier.createNoteBox(Domifier.createTextElements(text));
  }

  public static createTableRow(cellValues: DomBasicText[][] | undefined = undefined): IDomTableRow {
    const row: IDomTableRow = {
      kind: 'table-row',
      cells: []
    };

    if (cellValues) {
      for (const cellValue of cellValues) {
        const cell: IDomTableCell = {
          kind: 'table-cell',
          elements: cellValue
        };
        row.cells.push(cell);
      }
    }

    return row;
  }

  public static createTable(headerCellValues: DomBasicText[][] | undefined = undefined): IDomTable {
    let header: IDomTableRow | undefined = undefined;
    if (headerCellValues) {
      header = Domifier.createTableRow(headerCellValues);
    }
    return {
      kind: 'table',
      header: header,
      rows: []
    } as IDomTable;
  }

  public static createPage(title: string, docId: string): IDomPage {
    return {
      kind: 'page',
      docId: docId,
      breadcrumb: [],
      title: title,
      elements: []
    } as IDomPage;
  }

  public static renderDocElements(docElements: IDocElement[] | undefined): DomBasicText[] {
    if (!docElements) {
      return [];
    }

    const result: DomBasicText[] = [];

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
              } as IDomWebLink
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
