// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItem, ApiItemKind } from './ApiItem';

export class ApiNamespace extends ApiItem {
  public readonly kind: ApiItemKind = ApiItemKind.Namespace;

  /** @override */
  protected getSortKey(): string {
    return this.name;
  }
}
