// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DeclarationReference, Meaning, Navigation, Component } from '@microsoft/tsdoc/lib/beta/DeclarationReference';
import { ApiItemKind } from '../items/ApiItem';
import { ApiDeclaredItem, IApiDeclaredItemOptions, IApiDeclaredItemJson } from '../items/ApiDeclaredItem';
import { ApiReleaseTagMixin, IApiReleaseTagMixinOptions } from '../mixins/ApiReleaseTagMixin';
import { IApiNameMixinOptions, ApiNameMixin } from '../mixins/ApiNameMixin';
import { IExcerptTokenRange, Excerpt } from '../mixins/Excerpt';
import { DeserializerContext } from './DeserializerContext';

/**
 * Constructor options for {@link ApiVariable}.
 * @public
 */
export interface IApiVariableOptions extends
  IApiNameMixinOptions,
  IApiReleaseTagMixinOptions,
  IApiDeclaredItemOptions {

  variableTypeTokenRange: IExcerptTokenRange;
}

export interface IApiVariableJson extends IApiDeclaredItemJson {
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
 * `ApiVariable` represents an exported `const` or `let` object such as these examples:
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
export class ApiVariable extends ApiNameMixin(ApiReleaseTagMixin(ApiDeclaredItem)) {
  /**
   * An {@link Excerpt} that describes the type of the variable.
   */
  public readonly variableTypeExcerpt: Excerpt;

  public constructor(options: IApiVariableOptions) {
    super(options);

    this.variableTypeExcerpt = this.buildExcerpt(options.variableTypeTokenRange);
  }

  /** @override */
  public static onDeserializeInto(options: Partial<IApiVariableOptions>, context: DeserializerContext,
    jsonObject: IApiVariableJson): void {

    super.onDeserializeInto(options, context, jsonObject);

    options.variableTypeTokenRange = jsonObject.variableTypeTokenRange;
  }

  public static getContainerKey(name: string): string {
    return `${name}|${ApiItemKind.Variable}`;
  }

  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.Variable;
  }

  /** @override */
  public get containerKey(): string {
    return ApiVariable.getContainerKey(this.name);
  }

  /** @override */
  public serializeInto(jsonObject: Partial<IApiVariableJson>): void {
    super.serializeInto(jsonObject);

    jsonObject.variableTypeTokenRange = this.variableTypeExcerpt.tokenRange;
  }

  /** @beta @override */
  public buildCanonicalReference(): DeclarationReference {
    const nameComponent: Component = DeclarationReference.parseComponent(this.name);
    return (this.parent ? this.parent.canonicalReference : DeclarationReference.empty())
      .addNavigationStep(Navigation.Exports, nameComponent)
      .withMeaning(Meaning.Variable);
  }
}
