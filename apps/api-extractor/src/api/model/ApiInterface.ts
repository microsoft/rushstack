// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItem, ApiItemKind } from './ApiItem';
import { ApiItemContainerMixin } from '../mixins/ApiItemContainerMixin';

export class ApiInterface extends ApiItemContainerMixin(ApiItem) {
  public static getCanonicalReference(name: string): string {
    return `(${name}:interface)`;
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
