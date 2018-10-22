// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItemKind } from './ApiItem';
import { ApiDeclaration } from './ApiDeclaration';

export class ApiParameter extends ApiDeclaration {
  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.Parameter;
  }

  /** @override */
  public get canonicalReference(): string {
    return this.name;
  }
}
