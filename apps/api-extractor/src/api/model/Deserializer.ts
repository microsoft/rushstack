// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IApiItemJson, IApiItemOptions, ApiItem, ApiItemKind } from '../items/ApiItem';
import { ApiClass, IApiClassOptions, IApiClassJson } from './ApiClass';
import { ApiEntryPoint, IApiEntryPointOptions } from './ApiEntryPoint';
import { ApiMethod, IApiMethodOptions } from './ApiMethod';
import { ApiModel } from './ApiModel';
import { ApiNamespace, IApiNamespaceOptions } from './ApiNamespace';
import { ApiPackage, IApiPackageOptions } from './ApiPackage';
import { ApiInterface, IApiInterfaceOptions, IApiInterfaceJson } from './ApiInterface';
import { ApiPropertySignature, IApiPropertySignatureOptions } from './ApiPropertySignature';
import { ApiMethodSignature, IApiMethodSignatureOptions } from './ApiMethodSignature';
import { ApiProperty, IApiPropertyOptions } from './ApiProperty';
import { ApiEnumMember, IApiEnumMemberOptions, IApiEnumMemberJson } from './ApiEnumMember';
import { ApiEnum, IApiEnumOptions } from './ApiEnum';
import { IApiPropertyItemJson } from '../items/ApiPropertyItem';
import { ApiConstructor, IApiConstructorOptions } from './ApiConstructor';
import { ApiConstructSignature, IApiConstructSignatureOptions } from './ApiConstructSignature';
import { ApiFunction, IApiFunctionOptions } from './ApiFunction';
import { ApiCallSignature, IApiCallSignatureOptions } from './ApiCallSignature';
import { ApiIndexSignature, IApiIndexSignatureOptions } from './ApiIndexSignature';
import { ApiTypeAlias, IApiTypeAliasOptions } from './ApiTypeAlias';
import { ApiVariableDeclaration, IApiVariableDeclarationOptions, IApiVariableDeclarationJson } from './ApiVariableDeclaration';
import { IApiDeclaredItemJson } from '../items/ApiDeclaredItem';

export class Deserializer {
  public static deserialize(jsonObject: IApiItemJson): ApiItem {
    const options: Partial<IApiItemOptions> = { };

    switch (jsonObject.kind) {
      case ApiItemKind.Class:
        ApiClass.onDeserializeInto(options, jsonObject as IApiClassJson);
        return new ApiClass(options as IApiClassOptions);
      case ApiItemKind.CallSignature:
        ApiCallSignature.onDeserializeInto(options, jsonObject as IApiDeclaredItemJson);
        return new ApiCallSignature(options as IApiCallSignatureOptions);
      case ApiItemKind.Constructor:
        ApiConstructor.onDeserializeInto(options, jsonObject as IApiDeclaredItemJson);
        return new ApiConstructor(options as IApiConstructorOptions);
      case ApiItemKind.ConstructSignature:
        ApiConstructSignature.onDeserializeInto(options, jsonObject as IApiDeclaredItemJson);
        return new ApiConstructSignature(options as IApiConstructSignatureOptions);
      case ApiItemKind.EntryPoint:
        ApiEntryPoint.onDeserializeInto(options, jsonObject);
        return new ApiEntryPoint(options as IApiEntryPointOptions);
      case ApiItemKind.Enum:
        ApiEnum.onDeserializeInto(options, jsonObject as IApiDeclaredItemJson);
        return new ApiEnum(options as IApiEnumOptions);
      case ApiItemKind.EnumMember:
        ApiEnumMember.onDeserializeInto(options, jsonObject as IApiEnumMemberJson);
        return new ApiEnumMember(options as IApiEnumMemberOptions);
      case ApiItemKind.Function:
        ApiFunction.onDeserializeInto(options, jsonObject as IApiDeclaredItemJson);
        return new ApiFunction(options as IApiFunctionOptions);
      case ApiItemKind.IndexSignature:
        ApiIndexSignature.onDeserializeInto(options, jsonObject as IApiDeclaredItemJson);
        return new ApiIndexSignature(options as IApiIndexSignatureOptions);
      case ApiItemKind.Interface:
        ApiInterface.onDeserializeInto(options, jsonObject as IApiInterfaceJson);
        return new ApiInterface(options as IApiInterfaceOptions);
      case ApiItemKind.Method:
        ApiMethod.onDeserializeInto(options, jsonObject as IApiDeclaredItemJson);
        return new ApiMethod(options as IApiMethodOptions);
      case ApiItemKind.MethodSignature:
        ApiMethodSignature.onDeserializeInto(options, jsonObject as IApiDeclaredItemJson);
        return new ApiMethodSignature(options as IApiMethodSignatureOptions);
      case ApiItemKind.Model:
        return new ApiModel();
      case ApiItemKind.Namespace:
        ApiNamespace.onDeserializeInto(options, jsonObject as IApiDeclaredItemJson);
        return new ApiNamespace(options as IApiNamespaceOptions);
      case ApiItemKind.Package:
        ApiPackage.onDeserializeInto(options, jsonObject);
        return new ApiPackage(options as IApiPackageOptions);
      case ApiItemKind.Property:
        ApiProperty.onDeserializeInto(options, jsonObject as IApiPropertyItemJson);
        return new ApiProperty(options as IApiPropertyOptions);
      case ApiItemKind.PropertySignature:
        ApiPropertySignature.onDeserializeInto(options, jsonObject as IApiPropertyItemJson);
        return new ApiPropertySignature(options as IApiPropertySignatureOptions);
        case ApiItemKind.TypeAlias:
        ApiTypeAlias.onDeserializeInto(options, jsonObject as IApiDeclaredItemJson);
        return new ApiTypeAlias(options as IApiTypeAliasOptions);
      case ApiItemKind.VariableDeclaration:
        ApiVariableDeclaration.onDeserializeInto(options, jsonObject as IApiVariableDeclarationJson);
        return new ApiVariableDeclaration(options as IApiVariableDeclarationOptions);
      default:
        throw new Error(`Failed to deserialize unsupported API item type ${JSON.stringify(jsonObject.kind)}`);
    }
  }
}
