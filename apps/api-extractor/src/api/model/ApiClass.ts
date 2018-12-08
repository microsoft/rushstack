// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItemKind, IApiItemJson } from './ApiItem';
import { ApiDeclarationMixin, IApiDeclarationMixinOptions } from '../mixins/ApiDeclarationMixin';
import { ApiItemContainerMixin, IApiItemContainerMixinOptions } from '../mixins/ApiItemContainerMixin';
import { ApiDocumentedItem, IApiDocumentedItemOptions } from './ApiDocumentedItem';
import { ApiReleaseTagMixin, IApiReleaseTagMixinOptions } from '../mixins/ApiReleaseTagMixin';
import { IExcerptTokenRange, Excerpt } from '../mixins/Excerpt';

/**
 * Constructor options for {@link ApiClass}.
 * @public
 */
export interface IApiClassOptions extends
  IApiDeclarationMixinOptions,
  IApiItemContainerMixinOptions,
  IApiReleaseTagMixinOptions,
  IApiDocumentedItemOptions {

  extendsTokenRange: IExcerptTokenRange | undefined;
  implementsTokenRanges: IExcerptTokenRange[];
}

export interface IApiClassJson extends IApiItemJson {
  extendsTokenRange: IExcerptTokenRange | undefined;
  implementsTokenRanges: IExcerptTokenRange[];
}

/**
 * Represents a TypeScript class declaration.
 *
 * @remarks
 *
 * This is part of the {@link ApiModel} hierarchy of classes, which are serializable representations of
 * API declarations.
 *
 * `ApiClass` represents a TypeScript declaration such as this:
 *
 * ```ts
 * export class X { }
 * ```
 *
 * @public
 */
export class ApiClass extends ApiDeclarationMixin(ApiItemContainerMixin(ApiReleaseTagMixin(ApiDocumentedItem))) {
  public readonly extendsExcerpt: Excerpt | undefined;
  private readonly _implementsExcerpts: Excerpt[] = [];

  public static getCanonicalReference(name: string): string {
    return `(${name}:class)`;
  }

  /** @override */
  public static onDeserializeInto(options: Partial<IApiClassOptions>, jsonObject: IApiClassJson): void {
    super.onDeserializeInto(options, jsonObject);

    options.extendsTokenRange = jsonObject.extendsTokenRange;
    options.implementsTokenRanges = jsonObject.implementsTokenRanges;
  }

  public constructor(options: IApiClassOptions) {
    super(options);

    if (options.extendsTokenRange) {
      this.extendsExcerpt = this.buildExcerpt(options.extendsTokenRange);
    } else {
      this.extendsExcerpt = undefined;
    }

    for (const implementsTokenRange of options.implementsTokenRanges) {
      this._implementsExcerpts.push(this.buildExcerpt(implementsTokenRange));
    }
  }

  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.Class;
  }

  /** @override */
  public get canonicalReference(): string {
    return ApiClass.getCanonicalReference(this.name);
  }

  public get implementsExcerpts(): ReadonlyArray<Excerpt> {
    return this._implementsExcerpts;
  }

  /** @override */
  public serializeInto(jsonObject: Partial<IApiClassJson>): void {
    super.serializeInto(jsonObject);

    if (this.extendsExcerpt) {
      jsonObject.extendsTokenRange = this.extendsExcerpt.tokenRange;
    } else {
      jsonObject.extendsTokenRange = undefined;
    }

    jsonObject.implementsTokenRanges = this.implementsExcerpts.map(x => x.tokenRange);
  }
}
