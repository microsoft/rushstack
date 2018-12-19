// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItemKind } from '../items/ApiItem';
import { ApiDeclaredItem, IApiDeclaredItemOptions, IApiDeclaredItemJson } from '../items/ApiDeclaredItem';
import { ApiReleaseTagMixin, IApiReleaseTagMixinOptions } from '../mixins/ApiReleaseTagMixin';
import { IApiNameMixinOptions, ApiNameMixin } from '../mixins/ApiNameMixin';
import { IExcerptTokenRange, Excerpt } from '../mixins/Excerpt';

/**
 * Constructor options for {@link ApiVariableDeclaration}.
 * @public
 */
export interface IApiVariableDeclarationOptions extends
  IApiNameMixinOptions,
  IApiReleaseTagMixinOptions,
  IApiDeclaredItemOptions {

  variableTypeTokenRange: IExcerptTokenRange;
}

export interface IApiVariableDeclarationJson extends IApiDeclaredItemJson {
  variableTypeTokenRange: IExcerptTokenRange;
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
export class ApiVariableDeclaration extends ApiNameMixin(ApiReleaseTagMixin(ApiDeclaredItem)) {
  /**
   * An {@link Excerpt} that describes the type of the variable.
   */
  public readonly variableTypeExcerpt: Excerpt;

  /** @override */
  public static onDeserializeInto(options: Partial<IApiVariableDeclarationOptions>,
    jsonObject: IApiVariableDeclarationJson): void {

    super.onDeserializeInto(options, jsonObject);

    options.variableTypeTokenRange = jsonObject.variableTypeTokenRange;
  }

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

  /** @override */
  public serializeInto(jsonObject: Partial<IApiVariableDeclarationJson>): void {
    super.serializeInto(jsonObject);

    jsonObject.variableTypeTokenRange = this.variableTypeExcerpt.tokenRange;
  }
}
