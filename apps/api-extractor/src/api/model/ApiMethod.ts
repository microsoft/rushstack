// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItem, ApiItemKind, IApiItemOptions } from './ApiItem';
import { ApiStaticMixin, IApiStaticMixinOptions } from '../mixins/StaticMixin';
import { ApiFunctionLikeMixin, IApiFunctionLikeOptions } from '../mixins/ApiFunctionLikeMixin';

export interface IApiMethodOptions extends IApiFunctionLikeOptions, IApiStaticMixinOptions,
  IApiItemOptions {
}

export class ApiMethod extends ApiFunctionLikeMixin(ApiStaticMixin(ApiItem)) {
  public static getCanonicalReference(name: string, isStatic: boolean, overloadIndex: number): string {
    if (isStatic) {
      return `(${name}:static,${overloadIndex})`;
    } else {
      return `(${name}:instance,${overloadIndex})`;
    }
  }

  public constructor(options: IApiMethodOptions) {
    super(options);
  }

  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.Method;
  }

  /** @override */
  public get canonicalReference(): string {
    return ApiMethod.getCanonicalReference(this.name, this.isStatic, this.overloadIndex);
  }
}
