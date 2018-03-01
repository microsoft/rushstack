// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AstItem, AstItemKind } from './ast/AstItem';
import { ReleaseTag } from './aedoc/ReleaseTag';
import { MarkupElement, MarkupBasicElement } from './markup/MarkupElement';
import { ApiItem } from './api/ApiItem';
import { ApiJsonConverter } from './api/ApiJsonConverter';
import { IAedocParameter } from './aedoc/ApiDocumentation';

/**
 * A class to abstract away the difference between an item from our public API that could be
 * represented by either an AstItem or an ApiItem that is retrieved from a JSON file.
 */
export class ResolvedApiItem {
  public kind: AstItemKind;
  public summary: MarkupElement[];
  public remarks: MarkupElement[];
  public deprecatedMessage: MarkupBasicElement[] | undefined;
  public releaseTag: ReleaseTag;
  public isBeta: boolean;
  public params: { [name: string]: IAedocParameter } | undefined;
  public returnsMessage: MarkupBasicElement[] | undefined;
  /**
   * This property will either be an AstItem or undefined.
   */
  public astItem: AstItem | undefined;

  /**
   * A function to abstract the construction of a ResolvedApiItem instance
   * from an AstItem.
   */
  public static createFromAstItem(astItem: AstItem): ResolvedApiItem {
    return new ResolvedApiItem(
      astItem.kind,
      astItem.documentation.summary,
      astItem.documentation.remarks,
      astItem.documentation.deprecatedMessage,
      astItem.documentation.releaseTag === ReleaseTag.Beta,
      astItem.documentation.parameters,
      astItem.documentation.returnsMessage,
      astItem.documentation.releaseTag,
      astItem
    );
  }

  /**
   * A function to abstract the construction of a ResolvedApiItem instance
   * from a JSON object that symbolizes an ApiItem.
   */
  public static createFromJson(docItem: ApiItem): ResolvedApiItem {
    let parameters: { [name: string]: IAedocParameter } | undefined = undefined;
    let returnsMessage: MarkupBasicElement[] | undefined = undefined;
    switch (docItem.kind) {
      case 'function':
        parameters = docItem.parameters;
        returnsMessage = docItem.returnValue.description;
        break;
      case 'method':
        parameters = docItem.parameters;
        returnsMessage = docItem.returnValue.description;
        break;
      default:
        break;
    }

    return new ResolvedApiItem(
      ApiJsonConverter.convertJsonToKind(docItem.kind),
      docItem.summary,
      docItem.remarks,
      docItem.deprecatedMessage,
      docItem.isBeta,
      parameters,
      returnsMessage,
      ReleaseTag.Public,
      undefined
    );
  }

  private constructor(
    kind: AstItemKind,
    summary: MarkupElement[],
    remarks: MarkupElement[],
    deprecatedMessage: MarkupBasicElement[] | undefined,
    isBeta: boolean,
    params: { [name: string]: IAedocParameter } | undefined,
    returnsMessage: MarkupBasicElement[] | undefined,
    releaseTag: ReleaseTag,
    astItem: AstItem | undefined) {
    this.kind = kind;
    this.summary = summary;
    this.remarks = remarks;
    this.deprecatedMessage = deprecatedMessage;
    this.isBeta = isBeta;
    this.params = params;
    this.returnsMessage = returnsMessage;
    this.releaseTag = releaseTag;
    this.astItem = astItem;
  }
}
