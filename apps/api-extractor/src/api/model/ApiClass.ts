// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItemKind, ApiItem } from './ApiItem';
import { ApiDeclarationMixin, IApiDeclarationMixinOptions } from '../mixins/ApiDeclarationMixin';
import { ApiItemContainerMixin, IApiItemContainerMixinOptions } from '../mixins/ApiItemContainerMixin';

export interface IApiClassOptions extends IApiItemContainerMixinOptions, IApiDeclarationMixinOptions {
}

export class ApiClass extends ApiItemContainerMixin(ApiDeclarationMixin(ApiItem)) {
  public static getCanonicalReference(name: string): string {
    return `(${name}:class)`;
  }

  public constructor(options: IApiClassOptions) {
    super(options);
  }

  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.Class;
  }

  /** @override */
  public get canonicalReference(): string {
    return ApiClass.getCanonicalReference(this.name);
  }
}
