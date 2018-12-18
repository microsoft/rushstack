// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItemKind } from '../items/ApiItem';
import { ApiStaticMixin, IApiStaticMixinOptions } from '../mixins/ApiStaticMixin';
import { ApiDocumentedItem, IApiDocumentedItemOptions } from '../items/ApiDocumentedItem';
import { IApiDeclarationMixinOptions, ApiDeclarationMixin } from '../mixins/ApiDeclarationMixin';
import { IApiParameterListMixinOptions, ApiParameterListMixin } from '../mixins/ApiParameterListMixin';
import { IApiReleaseTagMixinOptions, ApiReleaseTagMixin } from '../mixins/ApiReleaseTagMixin';

/**
 * Constructor options for {@link ApiConstructor}.
 * @public
 */
export interface IApiConstructorOptions extends
  IApiDeclarationMixinOptions,
  IApiParameterListMixinOptions,
  IApiReleaseTagMixinOptions,
  IApiStaticMixinOptions,
  IApiDocumentedItemOptions {
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
export class ApiConstructor extends ApiDeclarationMixin(ApiParameterListMixin(ApiReleaseTagMixin(
  ApiStaticMixin(ApiDocumentedItem)))) {

  public static getCanonicalReference(isStatic: boolean, overloadIndex: number): string {
    if (isStatic) {
      return `(:static,${overloadIndex})`;
    } else {
      return `(:instance,${overloadIndex})`;
    }
  }

  public constructor(options: IApiConstructorOptions) {
    super(options);
  }

  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.Constructor;
  }

  /** @override */
  public get canonicalReference(): string {
    return ApiConstructor.getCanonicalReference(this.isStatic, this.overloadIndex);
  }
}
