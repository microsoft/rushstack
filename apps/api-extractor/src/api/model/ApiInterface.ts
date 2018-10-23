// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItemKind, ApiItem } from './ApiItem';
import { ApiItemContainerMixin, IApiItemContainerMixinOptions } from '../mixins/ApiItemContainerMixin';
import { ApiDeclarationMixin, IApiDeclarationMixinOptions } from '../mixins/ApiDeclarationMixin';

export interface IApiInterfaceOptions extends IApiItemContainerMixinOptions, IApiDeclarationMixinOptions {
}

export class ApiInterface extends ApiItemContainerMixin(ApiDeclarationMixin(ApiItem)) {
  public static getCanonicalReference(name: string): string {
    return `(${name}:interface)`;
  }

  public constructor(options: IApiInterfaceOptions) {
    super(options);
  }

  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.Interface;
  }

  /** @override */
  public get canonicalReference(): string {
    return ApiInterface.getCanonicalReference(this.name);
  }
}
