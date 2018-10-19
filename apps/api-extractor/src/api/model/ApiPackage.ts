// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItem, ApiItemKind, SerializedApiItem, IApiItemParameters } from './ApiItem';
import { JsonFile } from '@microsoft/node-core-library';

export class ApiPackage extends ApiItem {
  public readonly kind: ApiItemKind = ApiItemKind.Package;

  public static loadFromJsonFile(apiJsonFilename: string): ApiPackage {
    const jsonObject: { } = JsonFile.load(apiJsonFilename);
    return ApiItem.deserialize(jsonObject as SerializedApiItem<IApiItemParameters>) as ApiPackage;
  }

  public saveToJsonFile(apiJsonFilename: string): void {
    const jsonObject: { } = { };
    this.serializeInto(jsonObject);
    JsonFile.save(jsonObject, apiJsonFilename);
  }

  /** @override */
  protected getSortKey(): string {
    return this.name;
  }
}
