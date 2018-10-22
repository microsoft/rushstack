// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { SerializedApiItem, IApiItemOptions, ApiItem, ApiItemKind } from './ApiItem';
import { ApiClass } from './ApiClass';
import { ApiEntryPoint } from './ApiEntryPoint';
import { ApiMethod, IApiMethodOptions } from './ApiMethod';
import { ApiModel } from './ApiModel';
import { ApiNamespace } from './ApiNamespace';
import { ApiPackage } from './ApiPackage';
import { ApiInterface } from './ApiInterface';
import { ApiPropertySignature } from './ApiPropertySignature';

export class Deserializer {
  public static deserialize(jsonObject: SerializedApiItem<IApiItemOptions>): ApiItem {
    switch (jsonObject.kind) {
      case ApiItemKind.Class:
        return new ApiClass(jsonObject);
      case ApiItemKind.EntryPoint:
        return new ApiEntryPoint(jsonObject);
      case ApiItemKind.Interface:
        return new ApiInterface(jsonObject);
      case ApiItemKind.Method:
        return new ApiMethod(jsonObject as SerializedApiItem<IApiMethodOptions>);
      case ApiItemKind.Model:
        return new ApiModel();
      case ApiItemKind.Namespace:
        return new ApiNamespace(jsonObject);
      case ApiItemKind.Package:
        return new ApiPackage(jsonObject);
      case ApiItemKind.PropertySignature:
        return new ApiPropertySignature(jsonObject);
      default:
        throw new Error(`Failed to deserialize unsupported API item type ${JSON.stringify(jsonObject.kind)}`);
    }
  }
}
