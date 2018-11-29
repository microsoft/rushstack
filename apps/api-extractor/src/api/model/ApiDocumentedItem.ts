// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as tsdoc from '@microsoft/tsdoc';
import { ApiItem, IApiItemOptions, IApiItemJson } from './ApiItem';
import { AedocDefinitions } from '../../aedoc/AedocDefinitions';

/** @public */
export interface IApiDocumentedItemOptions extends IApiItemOptions {
  docComment: tsdoc.DocComment | undefined;
}

export interface IApiDocumentedItemJson extends IApiItemJson {
  docComment: string;
}

/** @public */
export class ApiDocumentedItem extends ApiItem {
  private _tsdocComment: tsdoc.DocComment | undefined;

  /** @override */
  public static onDeserializeInto(options: Partial<IApiDocumentedItemOptions>,
    jsonObject: IApiItemJson): void {

    ApiItem.onDeserializeInto(options, jsonObject);

    const documentedJson: IApiDocumentedItemJson = jsonObject as IApiDocumentedItemJson;

    if (documentedJson.docComment) {
      const tsdocParser: tsdoc.TSDocParser = new tsdoc.TSDocParser(AedocDefinitions.tsdocConfiguration);
      const parserContext: tsdoc.ParserContext = tsdocParser.parseString(documentedJson.docComment);

      // TODO: Warn about parser errors

      options.docComment = parserContext.docComment;
    }
  }

  public constructor(options: IApiDocumentedItemOptions) {
    super(options);
    this._tsdocComment = options.docComment;
  }

  public get tsdocComment(): tsdoc.DocComment | undefined {
    return this._tsdocComment;
  }

  /** @override */
  public serializeInto(jsonObject: Partial<IApiDocumentedItemJson>): void {
    super.serializeInto(jsonObject);
    if (this.tsdocComment !== undefined) {
      jsonObject.docComment = this.tsdocComment.emitAsTsdoc();
    } else {
      jsonObject.docComment = '';
    }
  }
}
