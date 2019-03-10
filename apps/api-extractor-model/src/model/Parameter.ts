// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as tsdoc from '@microsoft/tsdoc';

import { ApiDocumentedItem } from '../items/ApiDocumentedItem';
import { Excerpt } from '../mixins/Excerpt';
import { ApiParameterListMixin } from '../mixins/ApiParameterListMixin';

/**
 * Constructor options for {@link Parameter}.
 * @public
 */
export interface IParameterOptions {
  name: string;
  parameterTypeExcerpt: Excerpt;
  parent: ApiParameterListMixin;
}

/**
 * Represents a named parameter for a function-like declaration.
 *
 * @remarks
 *
 * `Parameter` represents a TypeScript declaration such as `x: number` in this example:
 *
 * ```ts
 * export function add(x: number, y: number): number {
 *   return x + y;
 * }
 * ```
 *
 * `Parameter` objects belong to the {@link ApiParameterListMixin.parameters} collection.
 *
 * @public
 */
export class Parameter {
  /**
   * An {@link Excerpt} that describes the type of the parameter.
   */
  public readonly parameterTypeExcerpt: Excerpt;

  /**
   * The parameter name.
   */
  public name: string;

  private _parent: ApiParameterListMixin;

  public constructor(options: IParameterOptions) {
    this.name = options.name;
    this.parameterTypeExcerpt = options.parameterTypeExcerpt;
    this._parent = options.parent;
  }

  /**
   * Returns the `@param` documentation for this parameter, if present.
   */
  public get tsdocParamBlock(): tsdoc.DocParamBlock | undefined {
    if (this._parent instanceof ApiDocumentedItem) {
      if (this._parent.tsdocComment) {
        return this._parent.tsdocComment.params.tryGetBlockByName(this.name);
      }
    }
  }

}
