// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItemKind, ApiItem } from './ApiItem';
import { IApiDeclarationMixinOptions, ApiDeclarationMixin } from '../mixins/ApiDeclarationMixin';

export interface IApiParameterOptions extends IApiDeclarationMixinOptions {
}

export class ApiParameter extends ApiDeclarationMixin(ApiItem) {
  public constructor(options: IApiParameterOptions) {
    super(options);
  }

  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.Parameter;
  }

  /** @override */
  public get canonicalReference(): string {
    return this.name;
  }
}
