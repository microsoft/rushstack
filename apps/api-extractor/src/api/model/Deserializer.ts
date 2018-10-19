// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { SerializedApiItem, IApiItemParameters, ApiItem, ApiItemKind } from './ApiItem';
import { ApiClass } from './ApiClass';
import { ApiEntryPoint } from './ApiEntryPoint';
import { ApiMethod } from './ApiMethod';
import { ApiModel } from './ApiModel';
import { ApiNamespace } from './ApiNamespace';
import { ApiPackage } from './ApiPackage';
import { ApiParameter } from './ApiParameter';

export class Deserializer {
  public static deserialize(jsonObject: SerializedApiItem<IApiItemParameters>): ApiItem {
    switch (jsonObject.kind) {
      case ApiItemKind.Class:
        return new ApiClass(jsonObject);
      case ApiItemKind.EntryPoint:
        return new ApiEntryPoint(jsonObject);
      case ApiItemKind.Method:
        return new ApiMethod(jsonObject);
      case ApiItemKind.Model:
        return new ApiModel(jsonObject);
      case ApiItemKind.Namespace:
        return new ApiNamespace(jsonObject);
      case ApiItemKind.Package:
        return new ApiPackage(jsonObject);
      case ApiItemKind.Parameter:
        return new ApiParameter(jsonObject);
      default:
        throw new Error(`Failed to deserialize unsupported API item type ${JSON.stringify(jsonObject.kind)}`);
    }
  }
}
