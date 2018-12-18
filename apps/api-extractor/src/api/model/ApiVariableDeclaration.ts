// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItemKind } from '../items/ApiItem';
import { ApiDeclarationMixin, IApiDeclarationMixinOptions } from '../mixins/ApiDeclarationMixin';
import { ApiDocumentedItem, IApiDocumentedItemOptions } from '../items/ApiDocumentedItem';
import { ApiReleaseTagMixin, IApiReleaseTagMixinOptions } from '../mixins/ApiReleaseTagMixin';
import { IApiNameMixinOptions, ApiNameMixin } from '../mixins/ApiNameMixin';

/**
 * Constructor options for {@link ApiVariableDeclaration}.
 * @public
 */
export interface IApiVariableDeclarationOptions extends
  IApiDeclarationMixinOptions,
  IApiNameMixinOptions,
  IApiReleaseTagMixinOptions,
  IApiDocumentedItemOptions {
}

/**
 * Represents a TypeScript variable declaration.
 *
 * @remarks
 *
 * This is part of the {@link ApiModel} hierarchy of classes, which are serializable representations of
 * API declarations.
 *
 * `ApiVariableDeclaration` represents an exported `const` or `let` object such as these examples:
 *
 * ```ts
 * // A variable declaration
 * export let verboseLogging: boolean;
 *
 * // A constant variable declaration with an initializer
 * export const canvas: IWidget = createCanvas();
 * ```
 *
 * @public
 */
export class ApiVariableDeclaration extends ApiDeclarationMixin(ApiNameMixin(ApiReleaseTagMixin(ApiDocumentedItem))) {
  public static getCanonicalReference(name: string): string {
    return name;
  }

  public constructor(options: IApiVariableDeclarationOptions) {
    super(options);
  }

  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.VariableDeclaration;
  }

  /** @override */
  public get canonicalReference(): string {
    return ApiVariableDeclaration.getCanonicalReference(this.name);
  }
}
