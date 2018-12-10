// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItemKind } from '../items/ApiItem';
import { ApiItemContainerMixin, IApiItemContainerMixinOptions } from '../mixins/ApiItemContainerMixin';
import { IApiDeclarationMixinOptions, ApiDeclarationMixin } from '../mixins/ApiDeclarationMixin';
import { IApiDocumentedItemOptions, ApiDocumentedItem } from '../items/ApiDocumentedItem';
import { ApiReleaseTagMixin, IApiReleaseTagMixinOptions } from '../mixins/ApiReleaseTagMixin';

/**
 * Constructor options for {@link ApiClass}.
 * @public
 */
export interface IApiNamespaceOptions extends
  IApiDeclarationMixinOptions,
  IApiItemContainerMixinOptions,
  IApiReleaseTagMixinOptions,
  IApiDocumentedItemOptions {
}

/**
 * Represents a TypeScript namespace declaration.
 *
 * @remarks
 *
 * This is part of the {@link ApiModel} hierarchy of classes, which are serializable representations of
 * API declarations.
 *
 * `ApiNamespace` represents a TypeScript declaration such as this:
 *
 * ```ts
 * export namespace X { }
 * ```
 *
 * @public
 */
export class ApiNamespace extends ApiDeclarationMixin(ApiItemContainerMixin(ApiReleaseTagMixin(ApiDocumentedItem))) {
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
