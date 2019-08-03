// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItemKind } from '../items/ApiItem';
import { IApiDeclaredItemOptions, ApiDeclaredItem } from '../items/ApiDeclaredItem';
import { IApiParameterListMixinOptions, ApiParameterListMixin } from '../mixins/ApiParameterListMixin';
import { IApiReleaseTagMixinOptions, ApiReleaseTagMixin } from '../mixins/ApiReleaseTagMixin';
import { IApiReturnTypeMixinOptions, ApiReturnTypeMixin } from '../mixins/ApiReturnTypeMixin';
import { ApiTypeParameterListMixin, IApiTypeParameterListMixinOptions } from '../mixins/ApiTypeParameterListMixin';

/**
 * Constructor options for {@link ApiConstructor}.
 * @public
 */
export interface IApiConstructSignatureOptions extends
  IApiTypeParameterListMixinOptions,
  IApiParameterListMixinOptions,
  IApiReleaseTagMixinOptions,
  IApiReturnTypeMixinOptions,
  IApiDeclaredItemOptions {
}

/**
 * Represents a TypeScript construct signature that belongs to an `ApiInterface`.
 *
 * @remarks
 *
 * This is part of the {@link ApiModel} hierarchy of classes, which are serializable representations of
 * API declarations.
 *
 * `ApiConstructSignature` represents a construct signature using the `new` keyword such as in this example:
 *
 * ```ts
 * export interface IVector {
 *   x: number;
 *   y: number;
 * }
 *
 * export interface IVectorConstructor {
 *   // A construct signature:
 *   new(x: number, y: number): IVector;
 * }
 *
 * export function createVector(vectorConstructor: IVectorConstructor,
 *   x: number, y: number): IVector {
 *   return new vectorConstructor(x, y);
 * }
 *
 * class Vector implements IVector {
 *   public x: number;
 *   public y: number;
 *   public constructor(x: number, y: number) {
 *     this.x = x;
 *     this.y = y;
 *   }
 * }
 *
 * let vector: Vector = createVector(Vector, 1, 2);
 * ```
 *
 * Compare with {@link ApiConstructor}, which describes the class constructor itself.
 *
 * @public
 */
export class ApiConstructSignature extends ApiTypeParameterListMixin(ApiParameterListMixin(ApiReleaseTagMixin(
  ApiReturnTypeMixin(ApiDeclaredItem)))) {

  public static getContainerKey(overloadIndex: number): string {
    return `|${ApiItemKind.ConstructSignature}|${overloadIndex}`;
  }

  public constructor(options: IApiConstructSignatureOptions) {
    super(options);
  }

  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.ConstructSignature;
  }

  /** @override */
  public get containerKey(): string {
    return ApiConstructSignature.getContainerKey(this.overloadIndex);
  }
}
