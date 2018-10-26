// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItemKind } from './ApiItem';
import { ApiDeclarationMixin, IApiDeclarationMixinOptions } from '../mixins/ApiDeclarationMixin';
import { ApiDocumentedItem, IApiDocumentedItemOptions } from './ApiDocumentedItem';

export interface IApiPropertySignatureOptions extends
  IApiDeclarationMixinOptions,
  IApiDocumentedItemOptions {
}

export class ApiPropertySignature extends ApiDeclarationMixin(ApiDocumentedItem) {
  public static getCanonicalReference(name: string): string {
    return name;
  }

  public constructor(options: IApiPropertySignatureOptions) {
    super(options);
  }

  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.PropertySignature;
  }

  /** @override */
  public get canonicalReference(): string {
    return ApiPropertySignature.getCanonicalReference(this.name);
  }
}
