// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItemKind } from './ApiItem';
import { ApiDeclarationMixin, IApiDeclarationMixinOptions } from '../mixins/ApiDeclarationMixin';
import { ApiStaticMixin, IApiStaticMixinOptions } from '../mixins/ApiStaticMixin';
import { ApiReleaseTagMixin, IApiReleaseTagMixinOptions } from '../mixins/ApiReleaseTagMixin';
import { ApiResultTypeMixin, IApiResultTypeMixinOptions } from '../mixins/ApiResultTypeMixin';
import { ApiPropertyItem, IApiPropertyItemOptions } from './ApiPropertyItem';

/** @public */
export interface IApiPropertyOptions extends
  IApiDeclarationMixinOptions,
  IApiReleaseTagMixinOptions,
  IApiResultTypeMixinOptions,
  IApiStaticMixinOptions,
  IApiPropertyItemOptions {
}

/** @public */
export class ApiProperty extends ApiDeclarationMixin(ApiReleaseTagMixin(
  ApiResultTypeMixin(ApiStaticMixin(ApiPropertyItem)))) {

  public static getCanonicalReference(name: string, isStatic: boolean): string {
    if (isStatic) {
      return `(${name}:static)`;
    } else {
      return `(${name}:instance)`;
    }
  }

  public constructor(options: IApiPropertyOptions) {
    super(options);
  }

  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.Property;
  }

  /** @override */
  public get canonicalReference(): string {
    return ApiProperty.getCanonicalReference(this.name, this.isStatic);
  }
}
