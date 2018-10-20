// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItem, ApiItemKind } from './ApiItem';
import { ApiMembersMixin } from './Mixins';
import { ApiPackage } from './ApiPackage';

export class ApiModel extends ApiMembersMixin(ApiItem) {
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
  public getSortKey(): string {
    return this.name;
  }
}
