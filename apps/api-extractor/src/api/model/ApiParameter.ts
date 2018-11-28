// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as tsdoc from '@microsoft/tsdoc';

import { ApiItemKind, ApiItem, IApiItemOptions } from './ApiItem';
import { IApiDeclarationMixinOptions, ApiDeclarationMixin } from '../mixins/ApiDeclarationMixin';
import { ApiDocumentedItem } from './ApiDocumentedItem';
import { Excerpt } from '../mixins/Excerpt';

/** @public */
export interface IApiParameterOptions extends
  IApiDeclarationMixinOptions,
  IApiItemOptions {
}

/** @public */
export class ApiParameter extends ApiDeclarationMixin(ApiItem) {
  public readonly parameterTypeExcerpt: Excerpt;

  public constructor(options: IApiParameterOptions) {
    super(options);

    this.parameterTypeExcerpt = this.getEmbeddedExcerpt('ParameterType');
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
}
