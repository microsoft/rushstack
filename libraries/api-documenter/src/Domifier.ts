// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  IDocMethod,
  IDocItem,
  IDocParam
} from '@microsoft/api-extractor/lib/IDocItem';
import {
  IDocElement,
  ITextElement,
  ILinkDocElement,
  ISeeDocElement
} from '@microsoft/api-extractor/lib/IDocElement';

import {
  DomBasicText,
  IDomDocLink,
  IDomWebLink,
  IDomText,
  IDomParagraph,
  IDomLineBreak,
  IDomTable,
  IDomTableRow,
  IDomTableCell,
  IDomHeading1,
  IDomHeading2
} from './SimpleDom';

import { RenderingHelpers } from './RenderingHelpers';

export class Domifier {
  public static BREAK: IDomLineBreak = {
    kind: 'break'
  };
  public static PARAGRAPH: IDomParagraph = {
    kind: 'paragraph'
  };

  public static createTextElements(text: string): IDomText[] {
    const trimmed: string = text;
    if (!trimmed) {
      return [];
    } else {
      return [
        {
          kind: 'text',
          content: trimmed
        } as IDomText
      ];
    }
  }

  public static createDocLink(text: string, targetDocId: string): IDomDocLink {
    if (!text) {
      throw new Error('Missing text for doc link');
    }

    return {
      kind: 'doc-link',
      elements: Domifier.createTextElements(text),
      targetDocId: targetDocId
    } as IDomDocLink;
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
            let linkText: string|undefined = linkDocElement.value;
            if (!linkText) {
              linkText = linkDocElement.exportName;
              if (linkDocElement.memberName) {
                linkText += '.' + linkDocElement.memberName;
              }
            }
            result.push(
              Domifier.createDocLink(linkText,
                RenderingHelpers.getDocId(linkDocElement.packageName || '', linkDocElement.exportName,
                  linkDocElement.memberName)
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
          result.push(
            ...Domifier.createTextElements('see ') // @todo
          );
          result.push(...Domifier.renderDocElements(seeDocElement.seeElements));
          break;
      }
    }

    return result;
  }
}
