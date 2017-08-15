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
  IDomLineBreak
} from './SimpleDom';

import { RenderingHelpers } from './RenderingHelpers';

export class Domifier {
  public static BREAK: IDomLineBreak = {
    kind: 'break'
  };
  public static PARAGRAPH: IDomParagraph = {
    kind: 'paragraph'
  };

  public static createText(text: string): IDomText[] {
    if (!text) {
      return [];
    } else {
      return [
        {
          kind: 'text',
          content: text
        } as IDomText
      ];
    }
  }

  public static createDocLink(text: string, targetDocId: string): IDomDocLink[] {
    if (!text) {
      throw new Error('Missing text for doc link');
    }

    return [
      {
        kind: 'doc-link',
        elements: Domifier.createText(text),
        targetDocId: targetDocId
      } as IDomDocLink
    ];
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
          result.push(
            ...Domifier.createText(textDocElement.value)
          );
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
              ...Domifier.createDocLink(linkText,
                RenderingHelpers.getDocId(linkDocElement.packageName || '', linkDocElement.exportName,
                  linkDocElement.memberName)
              )
            );
          } else {
            result.push(
              {
                kind: 'web-link',
                elements: Domifier.createText(linkDocElement.value || linkDocElement.targetUrl),
                targetUrl: linkDocElement.targetUrl
              } as IDomWebLink
            );
          }
          break;
        case 'seeDocElement':
          const seeDocElement: ISeeDocElement = docElement as ISeeDocElement;
          result.push(
            ...Domifier.createText('see ') // @todo
          );
          result.push(...Domifier.renderDocElements(seeDocElement.seeElements));
          break;
      }
    }

    return result;
  }

}
