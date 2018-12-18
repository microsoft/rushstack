// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as tsdoc from '@microsoft/tsdoc';

import { ApiItemKind, ApiItem, IApiItemOptions, IApiItemJson } from '../items/ApiItem';
import { IApiDeclarationMixinOptions, ApiDeclarationMixin } from '../mixins/ApiDeclarationMixin';
import { ApiDocumentedItem } from '../items/ApiDocumentedItem';
import { Excerpt, IExcerptTokenRange } from '../mixins/Excerpt';

/**
 * Constructor options for {@link ApiParameter}.
 * @public
 */
export interface IApiParameterOptions extends
  IApiDeclarationMixinOptions,
  IApiItemOptions {

  parameterTypeTokenRange: IExcerptTokenRange;
}

export interface IApiParameterJson extends IApiItemJson {
  parameterTypeTokenRange: IExcerptTokenRange;
}

/**
 * Represents a function parameter for a function-like declaration.
 *
 * @remarks
 *
 * This is part of the {@link ApiModel} hierarchy of classes, which are serializable representations of
 * API declarations.
 *
 * `ApiParameter` represents a TypeScript declaration such as `x: number` in this example:
 *
 * ```ts
 * export function add(x: number, y: number): number {
 *   return x + y;
 * }
 * ```
 *
 * `ApiParameter` objects belong to the {@link ApiParameterListMixin.parameters} collection.
 *
 * Even though it has associated documentation content, `ApiParameter` does not extend from `ApiDocumentedItem`
 * because it does not technically own its documentation; instead, the documentation is extracted from a `@param`
 * TSDoc tag belonging to a containing declaration such as `ApiMethod` or `ApiFunction`.
 *
 * @public
 */
export class ApiParameter extends ApiDeclarationMixin(ApiItem) {
  /**
   * An {@link Excerpt} that describes the type of the parameter.
   */
  public readonly parameterTypeExcerpt: Excerpt;

  /** @override */
  public static onDeserializeInto(options: Partial<IApiParameterOptions>, jsonObject: IApiParameterJson): void {
    super.onDeserializeInto(options, jsonObject);

    options.parameterTypeTokenRange = jsonObject.parameterTypeTokenRange;
  }

  public constructor(options: IApiParameterOptions) {
    super(options);

    this.parameterTypeExcerpt = this.buildExcerpt(options.parameterTypeTokenRange);
  }

  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.Parameter;
  }

  /** @override */
  public get canonicalReference(): string {
    return this.name;
  }

  /**
   * Returns the `@param` documentation for this parameter, if present.
   */
  public get tsdocParamBlock(): tsdoc.DocParamBlock | undefined {
    const parent: ApiItem | undefined = this.parent;
    if (parent) {
      if (parent instanceof ApiDocumentedItem) {
        if (parent.tsdocComment) {
          return parent.tsdocComment.params.tryGetBlockByName(this.name);
        }
      }
    }
  }

  /** @override */
  public serializeInto(jsonObject: Partial<IApiParameterJson>): void {
    super.serializeInto(jsonObject);

    jsonObject.parameterTypeTokenRange = this.parameterTypeExcerpt.tokenRange;
  }
}
