// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiDocumentedItem, IApiDocumentedItemOptions } from './ApiDocumentedItem';
import { Excerpt, IExcerptTokenRange } from '../mixins/Excerpt';
import { IApiDeclarationMixinOptions, ApiDeclarationMixin } from '../mixins/ApiDeclarationMixin';
import { IApiItemJson } from './ApiItem';
import { IApiFunctionLikeMixinOptions, ApiFunctionLikeMixin } from '../mixins/ApiFunctionLikeMixin';
import { IApiReleaseTagMixinOptions, ApiReleaseTagMixin } from '../mixins/ApiReleaseTagMixin';

/**
 * Constructor options for {@link ApiMethodItem}.
 * @public
 */
export interface IApiMethodItemOptions extends
  IApiDeclarationMixinOptions,
  IApiFunctionLikeMixinOptions,
  IApiReleaseTagMixinOptions,
  IApiDocumentedItemOptions {

  returnTypeTokenRange: IExcerptTokenRange;
}

export interface IApiMethodItemJson extends IApiItemJson {
  returnTypeTokenRange: IExcerptTokenRange;
}

/**
 * The abstract base class for {@link ApiMethod} and {@link ApiMethodSignature}.
 *
 * @public
 */
export class ApiMethodItem extends ApiDeclarationMixin(ApiFunctionLikeMixin(ApiReleaseTagMixin(
  ApiDocumentedItem))) {

  public readonly returnTypeExcerpt: Excerpt;

  /** @override */
  public static onDeserializeInto(options: Partial<IApiMethodItemOptions>, jsonObject: IApiMethodItemJson): void {
    super.onDeserializeInto(options, jsonObject);

    options.returnTypeTokenRange = jsonObject.returnTypeTokenRange;
  }

  public constructor(options: IApiMethodItemOptions) {
    super(options);

    this.returnTypeExcerpt = this.buildExcerpt(options.returnTypeTokenRange);
  }

  /** @override */
  public serializeInto(jsonObject: Partial<IApiMethodItemJson>): void {
    super.serializeInto(jsonObject);

    jsonObject.returnTypeTokenRange = this.returnTypeExcerpt.tokenRange;
  }
}
