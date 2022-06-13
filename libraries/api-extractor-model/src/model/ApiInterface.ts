// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  DeclarationReference,
  Meaning,
  Navigation,
  Component
} from '@microsoft/tsdoc/lib-commonjs/beta/DeclarationReference';
import { ApiItemKind } from '../items/ApiItem';
import {
  ApiItemContainerMixin,
  IApiItemContainerMixinOptions,
  IApiItemContainerJson
} from '../mixins/ApiItemContainerMixin';
import { ApiDeclaredItem, IApiDeclaredItemOptions, IApiDeclaredItemJson } from '../items/ApiDeclaredItem';
import {
  IApiReleaseTagMixinOptions,
  ApiReleaseTagMixin,
  IApiReleaseTagMixinJson
} from '../mixins/ApiReleaseTagMixin';
import { IApiNameMixinOptions, ApiNameMixin, IApiNameMixinJson } from '../mixins/ApiNameMixin';
import {
  IApiTypeParameterListMixinOptions,
  IApiTypeParameterListMixinJson,
  ApiTypeParameterListMixin
} from '../mixins/ApiTypeParameterListMixin';
import { DeserializerContext } from './DeserializerContext';
import { IApiExtendsMixinJson, IApiExtendsMixinOptions, ApiExtendsMixin } from '../mixins/ApiExtendsMixin';

/**
 * Constructor options for {@link ApiInterface}.
 * @public
 */
export interface IApiInterfaceOptions
  extends IApiItemContainerMixinOptions,
    IApiNameMixinOptions,
    IApiTypeParameterListMixinOptions,
    IApiReleaseTagMixinOptions,
    IApiDeclaredItemOptions,
    IApiExtendsMixinOptions {}

export interface IApiInterfaceJson
  extends IApiItemContainerJson,
    IApiNameMixinJson,
    IApiTypeParameterListMixinJson,
    IApiReleaseTagMixinJson,
    IApiDeclaredItemJson,
    IApiExtendsMixinJson {}

/**
 * Represents a TypeScript class declaration.
 *
 * @remarks
 *
 * This is part of the {@link ApiModel} hierarchy of classes, which are serializable representations of
 * API declarations.
 *
 * `ApiInterface` represents a TypeScript declaration such as this:
 *
 * ```ts
 * export interface X extends Y {
 * }
 * ```
 *
 * @public
 */
export class ApiInterface extends ApiItemContainerMixin(
  ApiNameMixin(ApiTypeParameterListMixin(ApiReleaseTagMixin(ApiExtendsMixin(ApiDeclaredItem))))
) {
  public constructor(options: IApiInterfaceOptions) {
    super(options);
  }

  public static getContainerKey(name: string): string {
    return `${name}|${ApiItemKind.Interface}`;
  }

  /** @override */
  public static onDeserializeInto(
    options: Partial<IApiInterfaceOptions>,
    context: DeserializerContext,
    jsonObject: IApiInterfaceJson
  ): void {
    super.onDeserializeInto(options, context, jsonObject);
  }

  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.Interface;
  }

  /** @override */
  public get containerKey(): string {
    return ApiInterface.getContainerKey(this.name);
  }

  /** @override */
  public serializeInto(jsonObject: Partial<IApiInterfaceJson>): void {
    super.serializeInto(jsonObject);
  }

  /** @beta @override */
  public buildCanonicalReference(): DeclarationReference {
    const nameComponent: Component = DeclarationReference.parseComponent(this.name);
    return (this.parent ? this.parent.canonicalReference : DeclarationReference.empty())
      .addNavigationStep(Navigation.Exports, nameComponent)
      .withMeaning(Meaning.Interface);
  }
}
