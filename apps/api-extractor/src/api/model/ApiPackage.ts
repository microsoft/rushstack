// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItem, ApiItemKind, IApiItemJson } from './ApiItem';
import { ApiItemContainerMixin, IApiItemContainerMixinOptions } from '../mixins/ApiItemContainerMixin';
import { JsonFile } from '@microsoft/node-core-library';
import { ApiDocumentedItem, IApiDocumentedItemOptions } from './ApiDocumentedItem';

export interface IApiPackageOptions extends
  IApiItemContainerMixinOptions,
  IApiDocumentedItemOptions {
}

export class ApiPackage extends ApiItemContainerMixin(ApiDocumentedItem) {
  public static loadFromJsonFile(apiJsonFilename: string): ApiPackage {
    const jsonObject: { } = JsonFile.load(apiJsonFilename);
    return ApiItem.deserialize(jsonObject as IApiItemJson) as ApiPackage;
  }

  public constructor(options: IApiPackageOptions) {
    super(options);
  }

  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.Package;
  }

  /** @override */
  public get canonicalReference(): string {
    return this.name;
  }

  public saveToJsonFile(apiJsonFilename: string): void {
    const jsonObject: { } = { };
    this.serializeInto(jsonObject);
    JsonFile.save(jsonObject, apiJsonFilename);
  }
}
