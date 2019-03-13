// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * API Extractor helps you build better TypeScript library packages.
 * It helps with validation, documentation, and reviewing of the exported API
 * for a TypeScript library.
 *
 * @packageDocumentation
 */

export { AedocDefinitions } from './aedoc/AedocDefinitions';
export { ReleaseTag } from './aedoc/ReleaseTag';

// items
export {
  IApiDeclaredItemOptions,
  ApiDeclaredItem
} from './items/ApiDeclaredItem';
export {
  IApiDocumentedItemOptions,
  ApiDocumentedItem
} from './items/ApiDocumentedItem';
export {
  ApiItemKind,
  IApiItemOptions,
  ApiItem
} from './items/ApiItem';
export {
  IApiPropertyItemOptions,
  ApiPropertyItem
} from './items/ApiPropertyItem';

// mixins
export {
  IApiParameterListMixinOptions,
  IApiParameterOptions,
  ApiParameterListMixin
} from './mixins/ApiParameterListMixin';
export {
  IApiItemContainerMixinOptions,
  ApiItemContainerMixin
} from './mixins/ApiItemContainerMixin';
export {
  IApiReleaseTagMixinOptions,
  ApiReleaseTagMixin
} from './mixins/ApiReleaseTagMixin';
export {
  IApiReturnTypeMixinOptions,
  ApiReturnTypeMixin
} from './mixins/ApiReturnTypeMixin';
export {
  IApiStaticMixinOptions,
  ApiStaticMixin
} from './mixins/ApiStaticMixin';
export {
  ExcerptTokenKind,
  IExcerptTokenRange,
  IExcerptToken,
  ExcerptToken,
  Excerpt
} from './mixins/Excerpt';
export {
  Constructor,
  PropertiesOf
} from './mixins/Mixin';

// model
export {
  IApiCallSignatureOptions,
  ApiCallSignature
} from './model/ApiCallSignature';
export {
  IApiClassOptions,
  ApiClass
} from './model/ApiClass';
export {
  IApiConstructorOptions,
  ApiConstructor
} from './model/ApiConstructor';
export {
  IApiConstructSignatureOptions,
  ApiConstructSignature
} from './model/ApiConstructSignature';
export {
  IApiEntryPointOptions,
  ApiEntryPoint
} from './model/ApiEntryPoint';
export {
  IApiEnumOptions,
  ApiEnum
} from './model/ApiEnum';
export {
  IApiEnumMemberOptions,
  ApiEnumMember
} from './model/ApiEnumMember';
export {
  IApiFunctionOptions,
  ApiFunction
} from './model/ApiFunction';
export {
  IApiIndexSignatureOptions,
  ApiIndexSignature
} from './model/ApiIndexSignature';
export {
  IApiInterfaceOptions,
  ApiInterface
} from './model/ApiInterface';
export {
  IApiMethodOptions,
  ApiMethod
} from './model/ApiMethod';
export {
  IApiMethodSignatureOptions,
  ApiMethodSignature
} from './model/ApiMethodSignature';
export {
  ApiModel
} from './model/ApiModel';
export {
  IApiNamespaceOptions,
  ApiNamespace
} from './model/ApiNamespace';
export {
  IApiPackageOptions,
  ApiPackage,
  IApiPackageSaveOptions
} from './model/ApiPackage';
export {
  IParameterOptions,
  Parameter
} from './model/Parameter';
export {
  IApiPropertyOptions,
  ApiProperty
} from './model/ApiProperty';
export {
  IApiPropertySignatureOptions,
  ApiPropertySignature
} from './model/ApiPropertySignature';
export {
  IApiTypeAliasOptions,
  ApiTypeAlias
} from './model/ApiTypeAlias';
export {
  IApiVariableOptions,
  ApiVariable
} from './model/ApiVariable';
export {
  IResolveDeclarationReferenceResult
} from './model/DeclarationReferenceResolver';
export {
  HeritageType
} from './model/HeritageType';
