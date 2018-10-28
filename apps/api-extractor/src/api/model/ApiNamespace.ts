// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItemKind } from './ApiItem';
import { ApiItemContainerMixin, IApiItemContainerMixinOptions } from '../mixins/ApiItemContainerMixin';
import { IApiDeclarationMixinOptions, ApiDeclarationMixin } from '../mixins/ApiDeclarationMixin';
import { IApiDocumentedItemOptions, ApiDocumentedItem } from './ApiDocumentedItem';

/** @public */
export interface IApiNamespaceOptions extends
  IApiItemContainerMixinOptions,
  IApiDeclarationMixinOptions,
  IApiDocumentedItemOptions {
}

/** @public */
export class ApiNamespace extends ApiItemContainerMixin(ApiDeclarationMixin(ApiDocumentedItem)) {
  public static getCanonicalReference(name: string): string {
    return `(${name}:namespace)`;
  }

  public constructor(options: IApiNamespaceOptions) {
    super(options);
  }

  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.Namespace;
  }

  /** @override */
  public get canonicalReference(): string {
    return ApiNamespace.getCanonicalReference(this.name);
  }
}
