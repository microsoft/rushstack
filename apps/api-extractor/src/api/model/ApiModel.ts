// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItem, ApiItemKind } from './ApiItem';
import { ApiItemContainerMixin } from '../mixins/ApiItemContainerMixin';
import { ApiPackage } from './ApiPackage';

/** @public */
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
    return ApiItemKind.Model;
  }

  /** @override */
  public get canonicalReference(): string {
    return this.name;
  }

  public get packages(): ReadonlyArray<ApiPackage> {
    return this.members as ReadonlyArray<ApiPackage>;
  }

  /** @override */
  public addMember(member: ApiPackage): void {
    if (member.kind !== ApiItemKind.Package) {
      throw new Error('Only items of type ApiPackage may be added to an ApiModel');
    }
    super.addMember(member);
  }
}
