// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItem, ApiItemKind } from './ApiItem';
import { ApiItemContainerMixin } from '../mixins/ApiItemContainerMixin';

export class ApiNamespace extends ApiItemContainerMixin(ApiItem) {
  public static getCanonicalSelector(): string {
    return 'namespace';
  }
    /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.Namespace;
  }

  /** @override */
  public get canonicalSelector(): string {
    return 'namespace'
  }

  /** @override */
  public getSortKey(): string {
    return this.name;
  }
}
