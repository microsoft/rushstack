// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import ApiItem, { ApiItemKind } from './definitions/ApiItem';
import { ReleaseTag } from './definitions/ApiDocumentation';
import { IDocElement, IParam } from './IDocElement';
import { IDocItem } from './IDocItem';
import ApiJsonFile from './generators/ApiJsonFile';

/**
 * A class to abstract away the difference between an item from our public API that could be
 * represented by either an ApiItem or an IDocItem that is retrieved from a JSON file.
 */
export default class ResolvedApiItem {
  public kind: ApiItemKind;
  public summary: IDocElement[];
  public remarks: IDocElement[];
  public deprecatedMessage: IDocElement[];
  public releaseTag: ReleaseTag;
  public isBeta: boolean;
  public params: {[name: string]: IParam};
  public returnsMessage: IDocElement[];
  /**
   * This property will either be an ApiItem or undefined.
   */
  public apiItem: ApiItem;

  /**
   * A function to abstract the construction of a ResolvedApiItem instance
   * from an ApiItem.
   */
  public static createFromApiItem(apiItem: ApiItem): ResolvedApiItem {
    return new ResolvedApiItem(
      apiItem.kind,
      apiItem.documentation.summary,
      apiItem.documentation.remarks,
      apiItem.documentation.deprecatedMessage,
      apiItem.documentation.releaseTag === ReleaseTag.Beta,
      apiItem.documentation.parameters,
      apiItem.documentation.returnsMessage,
      apiItem.documentation.releaseTag,
      apiItem
    );
  }

  /**
   * A function to abstract the construction of a ResolvedApiItem instance
   * from a JSON object that symbolizes an IDocItem.
   */
  public static createFromJson(docItem: IDocItem): ResolvedApiItem {
    let parameters: {[name: string]: IParam} = undefined;
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
    kind: ApiItemKind,
    summary: IDocElement[],
    remarks: IDocElement[],
    deprecatedMessage: IDocElement[],
    isBeta: boolean,
    params:  {[name: string]: IParam},
    returnsMessage: IDocElement[],
    releaseTag: ReleaseTag,
    apiItem: ApiItem) {
    this.kind = kind;
    this.summary = summary;
    this.remarks = remarks;
    this.deprecatedMessage = deprecatedMessage;
    this.isBeta = isBeta;
    this.params = params;
    this.returnsMessage = returnsMessage;
    this.releaseTag = releaseTag;
    this.apiItem = apiItem;
  }
}
