// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItem, ApiItemKind, IApiItemParameters } from './ApiItem';
import { ApiStaticMixin, IApiStaticMixinParameters } from '../mixins/StaticMixin';

export interface IApiMethodParameters extends IApiStaticMixinParameters, IApiItemParameters {
}

export class ApiMethod extends ApiStaticMixin(ApiItem) {
  public static getCanonicalSelector(name: string, isStatic: boolean, overloadIndex: number): string {
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
  public get canonicalSelector(): string {
    return ApiMethod.getCanonicalSelector(this.name, this.isStatic, 0);
  }

  /** @override */
  public getSortKey(): string {
    return this.name;
  }
}
