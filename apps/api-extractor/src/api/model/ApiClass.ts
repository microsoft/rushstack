// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItem, ApiItemKind } from './ApiItem';
import { ApiItemContainerMixin } from '../mixins/ApiItemContainerMixin';

export class ApiClass extends ApiItemContainerMixin(ApiItem) {
  public static getCanonicalSelector(): string {
    return 'class';
  }

  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.Class;
  }

  /** @override */
  public get canonicalSelector(): string {
    return ApiClass.getCanonicalSelector();
  }

  /** @override */
  public getSortKey(): string {
    return this.name;
  }
}
