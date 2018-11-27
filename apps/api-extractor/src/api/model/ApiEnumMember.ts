// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItemKind } from './ApiItem';
import { ApiDeclarationMixin, IApiDeclarationMixinOptions } from '../mixins/ApiDeclarationMixin';
import { ApiDocumentedItem, IApiDocumentedItemOptions } from './ApiDocumentedItem';
import { ApiReleaseTagMixin, IApiReleaseTagMixinOptions } from '../mixins/ApiReleaseTagMixin';

/** @public */
export interface IApiEnumMemberOptions extends
  IApiDeclarationMixinOptions,
  IApiReleaseTagMixinOptions,
  IApiDocumentedItemOptions {
}

/** @public */
export class ApiEnumMember extends ApiDeclarationMixin(ApiReleaseTagMixin(ApiDocumentedItem)) {

  public static getCanonicalReference(name: string): string {
    return name;
  }

  public constructor(options: IApiEnumMemberOptions) {
    super(options);
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
