// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItemKind } from './ApiItem';
import { ApiItemContainerMixin, IApiItemContainerMixinOptions } from '../mixins/ApiItemContainerMixin';
import { ApiDeclarationMixin, IApiDeclarationMixinOptions } from '../mixins/ApiDeclarationMixin';
import { ApiDocumentedItem, IApiDocumentedItemOptions } from './ApiDocumentedItem';

/** @public */
export interface IApiInterfaceOptions extends
  IApiItemContainerMixinOptions,
  IApiDeclarationMixinOptions,
  IApiDocumentedItemOptions {
}

/** @public */
export class ApiInterface extends ApiItemContainerMixin(ApiDeclarationMixin(ApiDocumentedItem)) {
  public static getCanonicalReference(name: string): string {
    return `(${name}:interface)`;
  }

  public constructor(options: IApiInterfaceOptions) {
    super(options);
  }

  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.Interface;
  }

  /** @override */
  public get canonicalReference(): string {
    return ApiInterface.getCanonicalReference(this.name);
  }
}
