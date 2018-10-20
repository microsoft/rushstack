// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItem, ApiItemKind } from './ApiItem';
import { ApiItemContainerMixin } from '../mixins/ApiItemContainerMixin';
import { ApiPackage } from './ApiPackage';

export class ApiModel extends ApiItemContainerMixin(ApiItem) {
  public constructor() {
    super({ name: 'MODEL' });
  }

  public loadPackage(apiJsonFilename: string): ApiPackage {
    const apiPackage: ApiPackage = ApiPackage.loadFromJsonFile(apiJsonFilename);
    this.addMember(apiPackage);
    return apiPackage;
  }

  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.Method;
  }

  /** @override */
  public get canonicalSelector(): string {
    return '0';
  }
  /** @override */
  public getSortKey(): string {
    return this.name;
  }
}
