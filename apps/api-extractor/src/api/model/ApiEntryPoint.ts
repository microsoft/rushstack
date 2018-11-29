// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItem, ApiItemKind } from './ApiItem';
import { ApiItemContainerMixin, IApiItemContainerMixinOptions } from '../mixins/ApiItemContainerMixin';

/** @public */
export interface IApiEntryPointOptions extends IApiItemContainerMixinOptions {
}

/** @public */
export class ApiEntryPoint extends ApiItemContainerMixin(ApiItem) {
  public constructor(options: IApiEntryPointOptions) {
    super(options);
  }

  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.EntryPoint;
  }

  /** @override */
  public get canonicalReference(): string {
    return this.name;
  }
}
