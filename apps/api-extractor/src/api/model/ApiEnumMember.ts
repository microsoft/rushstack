// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItemKind } from './ApiItem';
import { ApiDeclarationMixin, IApiDeclarationMixinOptions } from '../mixins/ApiDeclarationMixin';
import { ApiDocumentedItem, IApiDocumentedItemOptions } from './ApiDocumentedItem';
import { ApiReleaseTagMixin, IApiReleaseTagMixinOptions } from '../mixins/ApiReleaseTagMixin';
import { Excerpt } from '../mixins/Excerpt';

/** @public */
export interface IApiEnumMemberOptions extends
  IApiDeclarationMixinOptions,
  IApiReleaseTagMixinOptions,
  IApiDocumentedItemOptions {
}

/** @public */
export class ApiEnumMember extends ApiDeclarationMixin(ApiReleaseTagMixin(ApiDocumentedItem)) {
  public readonly initializerExcerpt: Excerpt;

  public static getCanonicalReference(name: string): string {
    return name;
  }

  public constructor(options: IApiEnumMemberOptions) {
    super(options);

    this.initializerExcerpt = this.getEmbeddedExcerpt('initializer');
  }

  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.EnumMember;
  }

  /** @override */
  public get canonicalReference(): string {
    return ApiEnumMember.getCanonicalReference(this.name);
  }
}
