// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItemKind } from './ApiItem';
import { ApiReleaseTagMixin, IApiReleaseTagMixinOptions } from '../mixins/ApiReleaseTagMixin';
import { ApiPropertyItem, IApiPropertyItemOptions } from './ApiPropertyItem';

/** @public */
export interface IApiPropertySignatureOptions extends
  IApiReleaseTagMixinOptions,
  IApiPropertyItemOptions {
}

/** @public */
export class ApiPropertySignature extends ApiReleaseTagMixin(ApiPropertyItem) {

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
