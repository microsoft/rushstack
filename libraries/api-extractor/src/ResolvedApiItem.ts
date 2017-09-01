// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import AstItem, { AstItemKind } from './ast/AstItem';
import { ReleaseTag } from './aedoc/ReleaseTag';
import { IDocElement } from './markupItem/OldMarkupItem';
import { IDocItem } from './api/ApiItem';
import ApiJsonFile from './api/ApiJsonFile';
import { IAedocParameter } from './aedoc/ApiDocumentation';

/**
 * A class to abstract away the difference between an item from our public API that could be
 * represented by either an AstItem or an IDocItem that is retrieved from a JSON file.
 */
export default class ResolvedApiItem {
  public kind: AstItemKind;
  public summary: IDocElement[];
  public remarks: IDocElement[];
  public deprecatedMessage: IDocElement[];
  public releaseTag: ReleaseTag;
  public isBeta: boolean;
  public params: {[name: string]: IAedocParameter};
  public returnsMessage: IDocElement[];
  /**
   * This property will either be an AstItem or undefined.
   */
  public astItem: AstItem;

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
   * from a JSON object that symbolizes an IDocItem.
   */
  public static createFromJson(docItem: IDocItem): ResolvedApiItem {
    let parameters: {[name: string]: IAedocParameter} = undefined;
    let returnsMessage: IDocElement[] = undefined;
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
      ApiJsonFile.convertJsonToKind(docItem.kind),
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
    summary: IDocElement[],
    remarks: IDocElement[],
    deprecatedMessage: IDocElement[],
    isBeta: boolean,
    params:  {[name: string]: IAedocParameter},
    returnsMessage: IDocElement[],
    releaseTag: ReleaseTag,
    astItem: AstItem) {
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
