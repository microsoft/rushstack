// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IApiItemJson, IApiItemOptions, ApiItem, ApiItemKind } from './ApiItem';
import { ApiClass } from './ApiClass';
import { ApiEntryPoint } from './ApiEntryPoint';
import { ApiMethod } from './ApiMethod';
import { ApiModel } from './ApiModel';
import { ApiNamespace } from './ApiNamespace';
import { ApiPackage } from './ApiPackage';
import { ApiInterface } from './ApiInterface';
import { ApiPropertySignature } from './ApiPropertySignature';
import { ApiParameter } from './ApiParameter';
import { ApiMethodSignature } from './ApiMethodSignature';
import { ApiProperty } from './ApiProperty';
import { ApiEnumMember } from './ApiEnumMember';
import { ApiEnum } from './ApiEnum';

export class Deserializer {
  public static deserialize(jsonObject: IApiItemJson): ApiItem {
    const options: Partial<IApiItemOptions> = { };

    switch (jsonObject.kind) {
      case ApiItemKind.Class:
        ApiClass.onDeserializeInto(options, jsonObject);
        return new ApiClass(options as any); // tslint:disable-line:no-any
      case ApiItemKind.EntryPoint:
        ApiEntryPoint.onDeserializeInto(options, jsonObject);
        return new ApiEntryPoint(options as any); // tslint:disable-line:no-any
      case ApiItemKind.Enum:
        ApiEnum.onDeserializeInto(options, jsonObject);
        return new ApiEnum(options as any); // tslint:disable-line:no-any
      case ApiItemKind.EnumMember:
        ApiEnumMember.onDeserializeInto(options, jsonObject);
        return new ApiEnumMember(options as any); // tslint:disable-line:no-any
      case ApiItemKind.Interface:
        ApiInterface.onDeserializeInto(options, jsonObject);
        return new ApiInterface(options as any); // tslint:disable-line:no-any
      case ApiItemKind.Method:
        ApiMethod.onDeserializeInto(options, jsonObject);
        return new ApiMethod(options as any); // tslint:disable-line:no-any
      case ApiItemKind.MethodSignature:
        ApiMethodSignature.onDeserializeInto(options, jsonObject);
        return new ApiMethodSignature(options as any); // tslint:disable-line:no-any
      case ApiItemKind.Model:
        return new ApiModel();
      case ApiItemKind.Namespace:
        ApiNamespace.onDeserializeInto(options, jsonObject);
        return new ApiNamespace(options as any); // tslint:disable-line:no-any
      case ApiItemKind.Package:
        ApiPackage.onDeserializeInto(options, jsonObject);
        return new ApiPackage(options as any); // tslint:disable-line:no-any
      case ApiItemKind.Parameter:
        ApiParameter.onDeserializeInto(options, jsonObject);
        return new ApiParameter(options as any); // tslint:disable-line:no-any
      case ApiItemKind.Property:
        ApiProperty.onDeserializeInto(options, jsonObject);
        return new ApiProperty(options as any); // tslint:disable-line:no-any
      case ApiItemKind.PropertySignature:
        ApiPropertySignature.onDeserializeInto(options, jsonObject);
        return new ApiPropertySignature(options as any); // tslint:disable-line:no-any
      default:
        throw new Error(`Failed to deserialize unsupported API item type ${JSON.stringify(jsonObject.kind)}`);
    }
  }
}
