// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItemKind } from './ApiItem';
import { ApiDeclarationMixin, IApiDeclarationMixinOptions } from '../mixins/ApiDeclarationMixin';
import { ApiFunctionLikeMixin, IApiFunctionLikeMixinOptions } from '../mixins/ApiFunctionLikeMixin';
import { ApiDocumentedItem, IApiDocumentedItemOptions } from './ApiDocumentedItem';
import { ApiReleaseTagMixin, IApiReleaseTagMixinOptions } from '../mixins/ApiReleaseTagMixin';

/** @public */
export interface IApiMethodSignatureOptions extends
  IApiDeclarationMixinOptions,
  IApiFunctionLikeMixinOptions,
  IApiReleaseTagMixinOptions,
  IApiDocumentedItemOptions {
}

/** @public */
export class ApiMethodSignature extends ApiDeclarationMixin(ApiFunctionLikeMixin(ApiReleaseTagMixin(
  ApiDocumentedItem))) {

  public static getCanonicalReference(name: string, overloadIndex: number): string {
    return `(${name}:${overloadIndex})`;
  }

  public constructor(options: IApiMethodSignatureOptions) {
    super(options);
  }

  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.MethodSignature;
  }
}
