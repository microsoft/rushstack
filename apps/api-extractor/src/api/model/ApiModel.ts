// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItem, ApiItemKind } from './ApiItem';
import { ApiPackage } from './ApiPackage';

export class ApiModel extends ApiItem {
  public readonly kind: ApiItemKind = ApiItemKind.Model;

  public loadPackage(apiJsonFilename: string): ApiPackage {
    const apiPackage: ApiPackage = ApiPackage.loadFromJsonFile(apiJsonFilename);
    this.addMember(apiPackage);
    return apiPackage;
  }

  /** @override */
  protected getSortKey(): string {
    return this.name;
  }
}
