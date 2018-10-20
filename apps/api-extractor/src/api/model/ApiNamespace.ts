// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItem, ApiItemKind } from './ApiItem';
import { ApiMembersMixin } from './Mixins';

export class ApiNamespace extends ApiMembersMixin(ApiItem) {
  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.Namespace;
  }

  /** @override */
  public getSortKey(): string {
    return this.name;
  }
}
