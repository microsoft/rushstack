// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItemKind } from './ApiItem';
import { ApiDeclarationMixin, IApiDeclarationMixinOptions } from '../mixins/ApiDeclarationMixin';
import { ApiItemContainerMixin, IApiItemContainerMixinOptions } from '../mixins/ApiItemContainerMixin';
import { ApiDocumentedItem, IApiDocumentedItemOptions } from './ApiDocumentedItem';

export interface IApiClassOptions extends
  IApiItemContainerMixinOptions,
  IApiDeclarationMixinOptions,
  IApiDocumentedItemOptions {
}

export class ApiClass extends ApiItemContainerMixin(ApiDeclarationMixin(ApiDocumentedItem)) {
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
