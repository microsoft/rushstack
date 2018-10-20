// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItem, ApiItemKind } from './ApiItem';
import { ApiItemContainerMixin } from '../mixins/ApiItemContainerMixin';

export class ApiEntryPoint extends ApiItemContainerMixin(ApiItem) {
  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.EntryPoint;
  }

  /** @override */
  public get canonicalSelector(): string {
    return '0';
  }

  /** @override */
  public getSortKey(): string {
    return this.name;
  }
}
