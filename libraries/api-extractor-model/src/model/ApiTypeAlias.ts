// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  DeclarationReference,
  Meaning,
  Navigation,
  type Component
} from '@microsoft/tsdoc/lib-commonjs/beta/DeclarationReference';

import type { Excerpt, IExcerptTokenRange } from '../mixins/Excerpt';
import { ApiItemKind } from '../items/ApiItem';
import {
  ApiDeclaredItem,
  type IApiDeclaredItemOptions,
  type IApiDeclaredItemJson
} from '../items/ApiDeclaredItem';
import { ApiReleaseTagMixin, type IApiReleaseTagMixinOptions } from '../mixins/ApiReleaseTagMixin';
import { type IApiNameMixinOptions, ApiNameMixin } from '../mixins/ApiNameMixin';
import {
  ApiTypeParameterListMixin,
  type IApiTypeParameterListMixinOptions,
  type IApiTypeParameterListMixinJson
} from '../mixins/ApiTypeParameterListMixin';
import type { DeserializerContext } from './DeserializerContext';
import {
  type IApiExportedMixinJson,
  type IApiExportedMixinOptions,
  ApiExportedMixin
} from '../mixins/ApiExportedMixin';

/**
 * Constructor options for {@link ApiTypeAlias}.
 * @public
 */
export interface IApiTypeAliasOptions
  extends IApiNameMixinOptions,
    IApiReleaseTagMixinOptions,
    IApiDeclaredItemOptions,
    IApiTypeParameterListMixinOptions,
    IApiExportedMixinOptions {
  typeTokenRange: IExcerptTokenRange;
}

export interface IApiTypeAliasJson
  extends IApiDeclaredItemJson,
    IApiTypeParameterListMixinJson,
    IApiExportedMixinJson {
  typeTokenRange: IExcerptTokenRange;
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
export class ApiTypeAlias extends ApiTypeParameterListMixin(
  ApiNameMixin(ApiReleaseTagMixin(ApiExportedMixin(ApiDeclaredItem)))
) {
  /**
   * An {@link Excerpt} that describes the type of the alias.
   *
   * @remarks
   * In the example below, the `typeExcerpt` would correspond to the subexpression
   * `T extends any[] ? BoxedArray<T[number]> : BoxedValue<T>;`:
   *
   * ```ts
   * export type Boxed<T> = T extends any[] ? BoxedArray<T[number]> : BoxedValue<T>;
   * ```
   */
  public readonly typeExcerpt: Excerpt;

  public constructor(options: IApiTypeAliasOptions) {
    super(options);

    this.typeExcerpt = this.buildExcerpt(options.typeTokenRange);
  }

  /** @override */
  public static onDeserializeInto(
    options: Partial<IApiTypeAliasOptions>,
    context: DeserializerContext,
    jsonObject: IApiTypeAliasJson
  ): void {
    super.onDeserializeInto(options, context, jsonObject);

    options.typeTokenRange = jsonObject.typeTokenRange;
  }

  public static getContainerKey(name: string): string {
    return `${name}|${ApiItemKind.TypeAlias}`;
  }

  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.TypeAlias;
  }

  /** @override */
  public get containerKey(): string {
    return ApiTypeAlias.getContainerKey(this.name);
  }

  /** @override */
  public serializeInto(jsonObject: Partial<IApiTypeAliasJson>): void {
    super.serializeInto(jsonObject);

    jsonObject.typeTokenRange = this.typeExcerpt.tokenRange;
  }

  /** @beta @override */
  public buildCanonicalReference(): DeclarationReference {
    const nameComponent: Component = DeclarationReference.parseComponent(this.name);
    const navigation: Navigation = this.isExported ? Navigation.Exports : Navigation.Locals;
    return (this.parent ? this.parent.canonicalReference : DeclarationReference.empty())
      .addNavigationStep(navigation, nameComponent)
      .withMeaning(Meaning.TypeAlias);
  }
}
