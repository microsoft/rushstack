// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Excerpt, IExcerptTokenRange } from '../mixins/Excerpt';
import { ApiItemKind } from '../items/ApiItem';
import { ApiDeclaredItem, IApiDeclaredItemOptions, IApiDeclaredItemJson } from '../items/ApiDeclaredItem';
import { ApiReleaseTagMixin, IApiReleaseTagMixinOptions } from '../mixins/ApiReleaseTagMixin';
import { IApiNameMixinOptions, ApiNameMixin } from '../mixins/ApiNameMixin';
import { ApiTypeParameterListMixin, IApiTypeParameterListMixinOptions, IApiTypeParameterListMixinJson
  } from '../mixins/ApiTypeParameterListMixin';

/**
 * Constructor options for {@link ApiTypeAlias}.
 * @public
 */
export interface IApiTypeAliasOptions extends
  IApiNameMixinOptions,
  IApiReleaseTagMixinOptions,
  IApiDeclaredItemOptions,
  IApiTypeParameterListMixinOptions {
  aliasTypeTokenRange: IExcerptTokenRange;
}

export interface IApiTypeAliasJson extends
  IApiDeclaredItemJson,
  IApiTypeParameterListMixinJson {
  aliasTypeTokenRange: IExcerptTokenRange;
}

/**
 * Represents a TypeScript type alias declaration.
 *
 * @remarks
 *
 * This is part of the {@link ApiModel} hierarchy of classes, which are serializable representations of
 * API declarations.
 *
 * `ApiTypeAlias` represents a definition such as one of these examples:
 *
 * ```ts
 * // A union type:
 * export type Shape = Square | Triangle | Circle;
 *
 * // A generic type alias:
 * export type BoxedValue<T> = { value: T };
 *
 * export type BoxedArray<T> = { array: T[] };
 *
 * // A conditional type alias:
 * export type Boxed<T> = T extends any[] ? BoxedArray<T[number]> : BoxedValue<T>;
 *
 * ```
 *
 * @public
 */
export class ApiTypeAlias extends ApiTypeParameterListMixin(ApiNameMixin(ApiReleaseTagMixin(ApiDeclaredItem))) {
  /**
   * An {@link Excerpt} that describes the type of the alias.
   */
  public readonly aliasTypeExcerpt: Excerpt;

  /** @override */
  public static onDeserializeInto(options: Partial<IApiTypeAliasOptions>, jsonObject: IApiTypeAliasJson): void {
    super.onDeserializeInto(options, jsonObject);

    // NOTE: This did not exist in the initial release, so we apply a default
    //       in the event it doesn't exist in 'jsonObject'.
    options.aliasTypeTokenRange = jsonObject.aliasTypeTokenRange || { startIndex: 0, endIndex: 0 };
  }

  public static getCanonicalReference(name: string): string {
    return name;
  }

  public constructor(options: IApiTypeAliasOptions) {
    super(options);

    this.aliasTypeExcerpt = this.buildExcerpt(options.aliasTypeTokenRange);
  }

  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.TypeAlias;
  }

  /** @override */
  public get canonicalReference(): string {
    return ApiTypeAlias.getCanonicalReference(this.name);
  }

  /** @override */
  public serializeInto(jsonObject: Partial<IApiTypeAliasJson>): void {
    super.serializeInto(jsonObject);

    jsonObject.aliasTypeTokenRange = this.aliasTypeExcerpt.tokenRange;
  }
}
