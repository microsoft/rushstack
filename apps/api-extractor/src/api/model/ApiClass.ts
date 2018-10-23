// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItemKind } from './ApiItem';
import { ApiDeclaration } from './ApiDeclaration';
import { ApiItemContainerMixin } from '../mixins/ApiItemContainerMixin';

export class ApiClass extends ApiItemContainerMixin(ApiDeclaration) {
  public static getCanonicalReference(name: string): string {
    return `(${name}:class)`;
  }

  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.Class;
  }

  /** @override */
  public get canonicalReference(): string {
    return ApiClass.getCanonicalReference(this.name);
  }
}
