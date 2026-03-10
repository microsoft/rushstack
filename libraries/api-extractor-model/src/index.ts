// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Use this library to read and write *.api.json files as defined by the
 * {@link https://api-extractor.com/ | API Extractor}  tool.  These files are used to generate a documentation
 * website for your TypeScript package.  The files store the API signatures and doc comments that were extracted
 * from your package.
 *
 * @packageDocumentation
 */

export { AedocDefinitions } from './aedoc/AedocDefinitions.ts';
export { ReleaseTag } from './aedoc/ReleaseTag.ts';

// items
export { type IApiDeclaredItemOptions, ApiDeclaredItem } from './items/ApiDeclaredItem.ts';
export { type IApiDocumentedItemOptions, ApiDocumentedItem } from './items/ApiDocumentedItem.ts';
export { ApiItemKind, type IApiItemOptions, ApiItem, type IApiItemConstructor } from './items/ApiItem.ts';
export { type IApiPropertyItemOptions, ApiPropertyItem } from './items/ApiPropertyItem.ts';

// mixins
export {
  type IApiParameterListMixinOptions,
  type IApiParameterOptions,
  ApiParameterListMixin
} from './mixins/ApiParameterListMixin.ts';
export {
  type IApiTypeParameterOptions,
  type IApiTypeParameterListMixinOptions,
  ApiTypeParameterListMixin
} from './mixins/ApiTypeParameterListMixin.ts';
export { type IApiAbstractMixinOptions, ApiAbstractMixin } from './mixins/ApiAbstractMixin.ts';
export { type IApiItemContainerMixinOptions, ApiItemContainerMixin } from './mixins/ApiItemContainerMixin.ts';
export { type IApiProtectedMixinOptions, ApiProtectedMixin } from './mixins/ApiProtectedMixin.ts';
export { type IApiReleaseTagMixinOptions, ApiReleaseTagMixin } from './mixins/ApiReleaseTagMixin.ts';
export { type IApiReturnTypeMixinOptions, ApiReturnTypeMixin } from './mixins/ApiReturnTypeMixin.ts';
export { type IApiStaticMixinOptions, ApiStaticMixin } from './mixins/ApiStaticMixin.ts';
export { type IApiNameMixinOptions, ApiNameMixin } from './mixins/ApiNameMixin.ts';
export { type IApiOptionalMixinOptions, ApiOptionalMixin } from './mixins/ApiOptionalMixin.ts';
export { type IApiReadonlyMixinOptions, ApiReadonlyMixin } from './mixins/ApiReadonlyMixin.ts';
export { type IApiInitializerMixinOptions, ApiInitializerMixin } from './mixins/ApiInitializerMixin.ts';
export { type IApiExportedMixinOptions, ApiExportedMixin } from './mixins/ApiExportedMixin.ts';
export {
  type IFindApiItemsResult,
  type IFindApiItemsMessage,
  FindApiItemsMessageId
} from './mixins/IFindApiItemsResult.ts';

export {
  ExcerptTokenKind,
  type IExcerptTokenRange,
  type IExcerptToken,
  ExcerptToken,
  Excerpt
} from './mixins/Excerpt.ts';
export type { Constructor, PropertiesOf } from './mixins/Mixin.ts';

// model
export { type IApiCallSignatureOptions, ApiCallSignature } from './model/ApiCallSignature.ts';
export { type IApiClassOptions, ApiClass } from './model/ApiClass.ts';
export { type IApiConstructorOptions, ApiConstructor } from './model/ApiConstructor.ts';
export { type IApiConstructSignatureOptions, ApiConstructSignature } from './model/ApiConstructSignature.ts';
export { type IApiEntryPointOptions, ApiEntryPoint } from './model/ApiEntryPoint.ts';
export { type IApiEnumOptions, ApiEnum } from './model/ApiEnum.ts';
export { type IApiEnumMemberOptions, ApiEnumMember, EnumMemberOrder } from './model/ApiEnumMember.ts';
export { type IApiFunctionOptions, ApiFunction } from './model/ApiFunction.ts';
export { type IApiIndexSignatureOptions, ApiIndexSignature } from './model/ApiIndexSignature.ts';
export { type IApiInterfaceOptions, ApiInterface } from './model/ApiInterface.ts';
export { type IApiMethodOptions, ApiMethod } from './model/ApiMethod.ts';
export { type IApiMethodSignatureOptions, ApiMethodSignature } from './model/ApiMethodSignature.ts';
export { ApiModel } from './model/ApiModel.ts';
export { type IApiNamespaceOptions, ApiNamespace } from './model/ApiNamespace.ts';
export { type IApiPackageOptions, ApiPackage, type IApiPackageSaveOptions } from './model/ApiPackage.ts';
export { type IParameterOptions, Parameter } from './model/Parameter.ts';
export { type IApiPropertyOptions, ApiProperty } from './model/ApiProperty.ts';
export { type IApiPropertySignatureOptions, ApiPropertySignature } from './model/ApiPropertySignature.ts';
export { type IApiTypeAliasOptions, ApiTypeAlias } from './model/ApiTypeAlias.ts';
export { type ITypeParameterOptions, TypeParameter } from './model/TypeParameter.ts';
export { type IApiVariableOptions, ApiVariable } from './model/ApiVariable.ts';
export { type IResolveDeclarationReferenceResult } from './model/ModelReferenceResolver.ts';
export { HeritageType } from './model/HeritageType.ts';
export { type ISourceLocationOptions, SourceLocation } from './model/SourceLocation.ts';
