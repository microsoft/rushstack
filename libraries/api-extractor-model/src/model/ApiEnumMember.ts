// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  DeclarationReference,
  Meaning,
  Navigation,
  Component
} from '@microsoft/tsdoc/lib-commonjs/beta/DeclarationReference';
import { ApiItemKind } from '../items/ApiItem';
import { ApiDeclaredItem, IApiDeclaredItemOptions, IApiDeclaredItemJson } from '../items/ApiDeclaredItem';
import { ApiReleaseTagMixin, IApiReleaseTagMixinOptions } from '../mixins/ApiReleaseTagMixin';
import { Excerpt, IExcerptTokenRange } from '../mixins/Excerpt';
import { IApiNameMixinOptions, ApiNameMixin } from '../mixins/ApiNameMixin';
import { DeserializerContext } from './DeserializerContext';

/**
 * Constructor options for {@link ApiEnumMember}.
 * @public
 */
export interface IApiEnumMemberOptions
  extends IApiNameMixinOptions,
    IApiReleaseTagMixinOptions,
    IApiDeclaredItemOptions {
  initializerTokenRange: IExcerptTokenRange;
}

/**
 * Options for customizing the sort order of {@link ApiEnum} members.
 *
 * @privateRemarks
 * This enum is currently only used by the `@microsoft/api-extractor` package; it is declared here
 * because we anticipate that if more options are added in the future, their sorting will be implemented
 * by the `@microsoft/api-extractor-model` package.
 *
 * See https://github.com/microsoft/rushstack/issues/918 for details.
 *
 * @public
 */
export enum EnumMemberOrder {
  /**
   * `ApiEnumMember` items are sorted according to their {@link ApiItem.getSortKey}.  The order is
   * basically alphabetical by identifier name, but otherwise unspecified to allow for cosmetic improvements.
   *
   * This is the default behavior.
   */
  ByName = 'by-name',

  /**
   * `ApiEnumMember` items preserve the original order of the declarations in the source file.
   * (This disables the automatic sorting that is normally applied based on {@link ApiItem.getSortKey}.)
   */
  Preserve = 'preserve'
}

export interface IApiEnumMemberJson extends IApiDeclaredItemJson {
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
 * `ApiEnumMember` represents an enum member such as `Small = 100` in the example below:
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
export class ApiEnumMember extends ApiNameMixin(ApiReleaseTagMixin(ApiDeclaredItem)) {
  /**
   * An {@link Excerpt} that describes the value of the enum member.
   */
  public readonly initializerExcerpt: Excerpt;

  public constructor(options: IApiEnumMemberOptions) {
    super(options);

    this.initializerExcerpt = this.buildExcerpt(options.initializerTokenRange);
  }

  public static getContainerKey(name: string): string {
    // No prefix needed, because ApiEnumMember is the only possible member of an ApiEnum
    return name;
  }

  /** @override */
  public static onDeserializeInto(
    options: Partial<IApiEnumMemberOptions>,
    context: DeserializerContext,
    jsonObject: IApiEnumMemberJson
  ): void {
    super.onDeserializeInto(options, context, jsonObject);

    options.initializerTokenRange = jsonObject.initializerTokenRange;
  }

  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.EnumMember;
  }

  /** @override */
  public get containerKey(): string {
    return ApiEnumMember.getContainerKey(this.name);
  }

  /** @override */
  public serializeInto(jsonObject: Partial<IApiEnumMemberJson>): void {
    super.serializeInto(jsonObject);

    jsonObject.initializerTokenRange = this.initializerExcerpt.tokenRange;
  }

  /** @beta @override */
  public buildCanonicalReference(): DeclarationReference {
    const nameComponent: Component = DeclarationReference.parseComponent(this.name);
    return (this.parent ? this.parent.canonicalReference : DeclarationReference.empty())
      .addNavigationStep(Navigation.Exports, nameComponent)
      .withMeaning(Meaning.Member);
  }
}
