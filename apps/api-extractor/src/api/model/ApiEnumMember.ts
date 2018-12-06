// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItemKind } from './ApiItem';
import { ApiDeclarationMixin, IApiDeclarationMixinOptions } from '../mixins/ApiDeclarationMixin';
import { ApiDocumentedItem, IApiDocumentedItemOptions } from './ApiDocumentedItem';
import { ApiReleaseTagMixin, IApiReleaseTagMixinOptions } from '../mixins/ApiReleaseTagMixin';
import { Excerpt } from '../mixins/Excerpt';

/**
 * Constructor options for {@link ApiEnumMember}.
 * @public
 */
export interface IApiEnumMemberOptions extends
  IApiDeclarationMixinOptions,
  IApiReleaseTagMixinOptions,
  IApiDocumentedItemOptions {
}

/**
 * Represents a member of a TypeScript enum declaration.
 *
 * @remarks
 *
 * This is part of the {@link ApiModel} hierarchy of classes, which are serializable representations of
 * API declarations.
 *
 * `ApiEnumMember` represents an enum member such as `Small` in the example below:
 *
 * ```ts
 * export enum FontSizes {
 *   Small = 100,
 *   Medium = 200,
 *   Large = 300
 * }
 * ```
 *
 * @public
 */
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
