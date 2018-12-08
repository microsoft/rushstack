// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItemKind, IApiItemJson } from './ApiItem';
import { ApiDeclarationMixin, IApiDeclarationMixinOptions } from '../mixins/ApiDeclarationMixin';
import { ApiDocumentedItem, IApiDocumentedItemOptions } from './ApiDocumentedItem';
import { ApiReleaseTagMixin, IApiReleaseTagMixinOptions } from '../mixins/ApiReleaseTagMixin';
import { Excerpt, IExcerptTokenRange } from '../mixins/Excerpt';

/**
 * Constructor options for {@link ApiEnumMember}.
 * @public
 */
export interface IApiEnumMemberOptions extends
  IApiDeclarationMixinOptions,
  IApiReleaseTagMixinOptions,
  IApiDocumentedItemOptions {

  initializerTokenRange: IExcerptTokenRange;
}

export interface IApiEnumMemberJson extends IApiItemJson {
  initializerTokenRange: IExcerptTokenRange;
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

  /** @override */
  public static onDeserializeInto(options: Partial<IApiEnumMemberOptions>, jsonObject: IApiEnumMemberJson): void {
    super.onDeserializeInto(options, jsonObject);

    options.initializerTokenRange = jsonObject.initializerTokenRange;
  }

  public constructor(options: IApiEnumMemberOptions) {
    super(options);

    this.initializerExcerpt = this.buildExcerpt(options.initializerTokenRange);
  }

  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.EnumMember;
  }

  /** @override */
  public get canonicalReference(): string {
    return ApiEnumMember.getCanonicalReference(this.name);
  }

  /** @override */
  public serializeInto(jsonObject: Partial<IApiEnumMemberJson>): void {
    super.serializeInto(jsonObject);

    jsonObject.initializerTokenRange = this.initializerExcerpt.tokenRange;
  }
}
