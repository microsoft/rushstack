// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItemKind } from '../items/ApiItem';
import { IApiDeclarationMixinOptions, ApiDeclarationMixin } from '../mixins/ApiDeclarationMixin';
import { IApiFunctionLikeMixinOptions, ApiFunctionLikeMixin } from '../mixins/ApiFunctionLikeMixin';
import { IApiDocumentedItemOptions, ApiDocumentedItem } from '../items/ApiDocumentedItem';
import { IApiReleaseTagMixinOptions, ApiReleaseTagMixin } from '../mixins/ApiReleaseTagMixin';
import { IApiReturnTypeMixinOptions, ApiReturnTypeMixin } from '../mixins/ApiReturnTypeMixin';

/**
 * Constructor options for {@link ApiIndexSignature}.
 * @public
 */
export interface IApiIndexSignatureOptions extends
  IApiDeclarationMixinOptions,
  IApiFunctionLikeMixinOptions,
  IApiReleaseTagMixinOptions,
  IApiReturnTypeMixinOptions,
  IApiDocumentedItemOptions {
}

/**
 * Represents a TypeScript index signature.
 *
 * @remarks
 *
 * This is part of the {@link ApiModel} hierarchy of classes, which are serializable representations of
 * API declarations.
 *
 * `ApiIndexSignature` represents a TypeScript declaration such as `[x: number]: number` in this example:
 *
 * ```ts
 * interface INumberTable {
 *   // An index signature
 *   [value: number]: number;
 *
 *   // An overloaded index signature
 *   [name: string]: number;
 * }
 * ```
 *
 * @public
 */
export class ApiIndexSignature extends ApiDeclarationMixin(ApiFunctionLikeMixin(ApiReleaseTagMixin(
  ApiReturnTypeMixin(ApiDocumentedItem)))) {

  public static getCanonicalReference(name: string, overloadIndex: number): string {
    return `(${name}:${overloadIndex})`;
  }

  public constructor(options: IApiIndexSignatureOptions) {
    super(options);
  }

  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.IndexSignature;
  }

  /** @override */
  public get canonicalReference(): string {
    return ApiIndexSignature.getCanonicalReference(this.name, this.overloadIndex);
  }
}
