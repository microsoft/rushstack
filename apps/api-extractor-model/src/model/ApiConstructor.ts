// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItemKind } from '../items/ApiItem';
import { IApiDeclaredItemOptions, ApiDeclaredItem } from '../items/ApiDeclaredItem';
import { IApiParameterListMixinOptions, ApiParameterListMixin } from '../mixins/ApiParameterListMixin';
import { IApiReleaseTagMixinOptions, ApiReleaseTagMixin } from '../mixins/ApiReleaseTagMixin';

/**
 * Constructor options for {@link ApiConstructor}.
 * @public
 */
export interface IApiConstructorOptions extends
  IApiParameterListMixinOptions,
  IApiReleaseTagMixinOptions,
  IApiDeclaredItemOptions {
}

/**
 * Represents a TypeScript class constructor declaration that belongs to an `ApiClass`.
 *
 * @remarks
 *
 * This is part of the {@link ApiModel} hierarchy of classes, which are serializable representations of
 * API declarations.
 *
 * `ApiConstructor` represents a declaration using the `constructor` keyword such as in this example:
 *
 * ```ts
 * export class Vector {
 *   public x: number;
 *   public y: number;
 *
 *   // A class constructor:
 *   public constructor(x: number, y: number) {
 *     this.x = x;
 *     this.y = y;
 *   }
 * }
 * ```
 *
 * Compare with {@link ApiConstructSignature}, which describes the construct signature for a class constructor.
 *
 * @public
 */
export class ApiConstructor extends ApiParameterListMixin(ApiReleaseTagMixin(ApiDeclaredItem)) {

  public static getContainerKey(overloadIndex: number): string {
    return `|${ApiItemKind.Constructor}|${overloadIndex}`;
  }

  public constructor(options: IApiConstructorOptions) {
    super(options);
  }

  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.Constructor;
  }

  /** @override */
  public get containerKey(): string {
    return ApiConstructor.getContainerKey(this.overloadIndex);
  }
}
