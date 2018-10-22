// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItem, ApiItemKind, IApiItemParameters } from './ApiItem';
import { ApiStaticMixin, IApiStaticMixinParameters } from '../mixins/StaticMixin';
import { ApiFunctionLikeMixin, IApiFunctionLikeParameters } from '../mixins/ApiFunctionLikeMixin';

export interface IApiMethodParameters extends IApiFunctionLikeParameters, IApiStaticMixinParameters,
  IApiItemParameters {
}

export class ApiMethod extends ApiFunctionLikeMixin(ApiStaticMixin(ApiItem)) {
  public static getCanonicalReference(name: string, isStatic: boolean, overloadIndex: number): string {
    if (isStatic) {
      return `(${name}:static,${overloadIndex})`;
    } else {
      return `(${name}:instance,${overloadIndex})`;
    }
  }

  public constructor(parameters: IApiMethodParameters) {
    super(parameters);
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
