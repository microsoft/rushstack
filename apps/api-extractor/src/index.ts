// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * API Extractor helps you build better TypeScript library packages.
 * It helps with validation, documentation, and reviewing of the exported API
 * for a TypeScript library.
 *
 * @packagedocumentation
 */

export { ReleaseTag } from './aedoc/ReleaseTag';

export { Extractor, IAnalyzeProjectOptions, IExtractorOptions } from './api/Extractor';
export {
  IExtractorTsconfigCompilerConfig,
  IExtractorRuntimeCompilerConfig,
  IExtractorProjectConfig,
  IExtractorPoliciesConfig,
  ExtractorValidationRulePolicy,
  IExtractorValidationRulesConfig,
  IExtractorApiReviewFileConfig,
  IExtractorApiJsonFileConfig,
  IExtractorDtsRollupConfig,
  IExtractorConfig
} from './api/IExtractorConfig';

export { ILogger } from './api/ILogger';

export { IndentedWriter } from './api/IndentedWriter';

export {
  IApiDeclarationMixinOptions,
  ApiDeclarationMixin
} from './api/mixins/ApiDeclarationMixin';
export {
  IApiFunctionLikeMixinOptions,
  ApiFunctionLikeMixin
} from './api/mixins/ApiFunctionLikeMixin';
export {
  IApiItemContainerMixinOptions,
  ApiItemContainerMixin
} from './api/mixins/ApiItemContainerMixin';
export {
  IApiReleaseTagMixinOptions,
  ApiReleaseTagMixin
} from './api/mixins/ApiReleaseTagMixin';
export {
  IApiReturnTypeMixinOptions,
  ApiReturnTypeMixin
} from './api/mixins/ApiReturnTypeMixin';
export {
  IApiStaticMixinOptions,
  ApiStaticMixin
} from './api/mixins/ApiStaticMixin';
export {
  ExcerptTokenKind,
  IExcerptTokenRange,
  IExcerptToken,
  ExcerptToken,
  Excerpt
} from './api/mixins/Excerpt';
export {
  Constructor,
  PropertiesOf
} from './api/mixins/Mixin';

export {
  IApiCallSignatureOptions,
  ApiCallSignature
} from './api/model/ApiCallSignature';
export {
  IApiClassOptions,
  ApiClass
} from './api/model/ApiClass';
export {
  IApiConstructorOptions,
  ApiConstructor
} from './api/model/ApiConstructor';
export {
  IApiConstructSignatureOptions,
  ApiConstructSignature
} from './api/model/ApiConstructSignature';
export {
  IApiDocumentedItemOptions,
  ApiDocumentedItem
} from './api/items/ApiDocumentedItem';
export {
  IApiEntryPointOptions,
  ApiEntryPoint
} from './api/model/ApiEntryPoint';
export {
  IApiEnumOptions,
  ApiEnum
} from './api/model/ApiEnum';
export {
  IApiEnumMemberOptions,
  ApiEnumMember
} from './api/model/ApiEnumMember';
export {
  IApiFunctionOptions,
  ApiFunction
} from './api/model/ApiFunction';
export {
  IApiIndexSignatureOptions,
  ApiIndexSignature
} from './api/model/ApiIndexSignature';
export {
  IApiInterfaceOptions,
  ApiInterface
} from './api/model/ApiInterface';
export {
  ApiItemKind,
  IApiItemOptions,
  ApiItem
} from './api/items/ApiItem';
export {
  IApiMethodOptions,
  ApiMethod
} from './api/model/ApiMethod';
export {
  IApiMethodSignatureOptions,
  ApiMethodSignature
} from './api/model/ApiMethodSignature';
export {
  ApiModel
} from './api/model/ApiModel';
export {
  IApiNamespaceOptions,
  ApiNamespace
} from './api/model/ApiNamespace';
export {
  IApiPackageOptions,
  ApiPackage
} from './api/model/ApiPackage';
export {
  IApiParameterOptions,
  ApiParameter
} from './api/model/ApiParameter';
export {
  IApiPropertyOptions,
  ApiProperty
} from './api/model/ApiProperty';
export {
  IApiPropertyItemOptions,
  ApiPropertyItem
} from './api/items/ApiPropertyItem';
export {
  IApiPropertySignatureOptions,
  ApiPropertySignature
} from './api/model/ApiPropertySignature';
export {
  IApiTypeAliasOptions,
  ApiTypeAlias
} from './api/model/ApiTypeAlias';
export {
  IResolveDeclarationReferenceResult
} from './api/model/DeclarationReferenceResolver';
export {
  HeritageType
} from './api/model/HeritageType';
