// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItem, ApiItemKind } from './ApiItem';

export class ApiMethod extends ApiItem {
  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.Method;
  }

  /** @override */
  public getSortKey(): string {
    return this.name;
  }
}
