// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItemKind } from './ApiItem';
import { ApiDeclarationMixin, IApiDeclarationMixinOptions } from '../mixins/ApiDeclarationMixin';
import { ApiReleaseTagMixin, IApiReleaseTagMixinOptions } from '../mixins/ApiReleaseTagMixin';
import { ApiResultTypeMixin, IApiResultTypeMixinOptions } from '../mixins/ApiResultTypeMixin';
import { ApiPropertyItem, IApiPropertyItemOptions } from './ApiPropertyItem';

/** @public */
export interface IApiPropertySignatureOptions extends
  IApiDeclarationMixinOptions,
  IApiReleaseTagMixinOptions,
  IApiResultTypeMixinOptions,
  IApiPropertyItemOptions {
}

/** @public */
export class ApiPropertySignature extends ApiDeclarationMixin(ApiReleaseTagMixin(
  ApiResultTypeMixin(ApiPropertyItem))) {

  public static getCanonicalReference(name: string): string {
    return name;
  }

  public constructor(options: IApiPropertySignatureOptions) {
    super(options);
  }

  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.PropertySignature;
  }

  /** @override */
  public get canonicalReference(): string {
    return ApiPropertySignature.getCanonicalReference(this.name);
  }
}
