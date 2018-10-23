// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IApiItemOptions, IApiItemJson, ApiItem } from './ApiItem';

export interface IApiDeclarationOptions extends IApiItemOptions {
  signature: string;
}

export interface IApiDeclarationJson extends IApiItemJson {
  signature: string;
}

export class ApiDeclaration extends ApiItem {
  private readonly _signature: string;

  /** @override */
  public static onDeserializeInto(options: Partial<IApiDeclarationOptions>, jsonObject: IApiItemJson): void {
    ApiItem.onDeserializeInto(options, jsonObject);

    const declarationJson: IApiDeclarationJson = jsonObject as IApiDeclarationJson;

    options.signature = declarationJson.signature;
  }

  public constructor(options: IApiDeclarationOptions) {
    super(options);

    this._signature = options.signature;
  }

  /** @override */
  public serializeInto(jsonObject: Partial<IApiDeclarationJson>): void {
    super.serializeInto(jsonObject);

    jsonObject.signature = this._signature;
  }
}
