[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md)

## api-extractor package

API Extractor helps you build better TypeScript library packages. It helps with validation, documentation, and reviewing of the exported API for a TypeScript library.

## Classes

|  Class | Description |
|  --- | --- |
|  [ApiCallSignature](./api-extractor.apicallsignature.md) | Represents a TypeScript function call signature. |
|  [ApiClass](./api-extractor.apiclass.md) | Represents a TypeScript class declaration. |
|  [ApiConstructor](./api-extractor.apiconstructor.md) | Represents a TypeScript class constructor declaration that belongs to an `ApiClass`<!-- -->. |
|  [ApiConstructSignature](./api-extractor.apiconstructsignature.md) | Represents a TypeScript construct signature that belongs to an `ApiInterface`<!-- -->. |
|  [ApiDeclaredItem](./api-extractor.apideclareditem.md) | The base class for API items that have an associated source code excerpt containing a TypeScript declaration. |
|  [ApiDocumentedItem](./api-extractor.apidocumenteditem.md) | An abstract base class for API declarations that can have an associated TSDoc comment. |
|  [ApiEntryPoint](./api-extractor.apientrypoint.md) | Represents the entry point for an NPM package. |
|  [ApiEnum](./api-extractor.apienum.md) | Represents a TypeScript enum declaration. |
|  [ApiEnumMember](./api-extractor.apienummember.md) | Represents a member of a TypeScript enum declaration. |
|  [ApiFunction](./api-extractor.apifunction.md) | Represents a TypeScript function declaration. |
|  [ApiIndexSignature](./api-extractor.apiindexsignature.md) | Represents a TypeScript index signature. |
|  [ApiInterface](./api-extractor.apiinterface.md) | Represents a TypeScript class declaration. |
|  [ApiItem](./api-extractor.apiitem.md) | The abstract base class for all members of an `ApiModel` object. |
|  [ApiMethod](./api-extractor.apimethod.md) | Represents a TypeScript member function declaration that belongs to an `ApiClass`<!-- -->. |
|  [ApiMethodSignature](./api-extractor.apimethodsignature.md) | Represents a TypeScript member function declaration that belongs to an `ApiInterface`<!-- -->. |
|  [ApiModel](./api-extractor.apimodel.md) | A serializable representation of a collection of API declarations. |
|  [ApiNamespace](./api-extractor.apinamespace.md) | Represents a TypeScript namespace declaration. |
|  [ApiPackage](./api-extractor.apipackage.md) | Represents an NPM package containing API declarations. |
|  [ApiProperty](./api-extractor.apiproperty.md) | Represents a TypeScript property declaration that belongs to an `ApiClass`<!-- -->. |
|  [ApiPropertyItem](./api-extractor.apipropertyitem.md) | The abstract base class for [ApiProperty](./api-extractor.apiproperty.md) and [ApiPropertySignature](./api-extractor.apipropertysignature.md)<!-- -->. |
|  [ApiPropertySignature](./api-extractor.apipropertysignature.md) | Represents a TypeScript property declaration that belongs to an `ApiInterface`<!-- -->. |
|  [ApiTypeAlias](./api-extractor.apitypealias.md) | Represents a TypeScript type alias declaration. |
|  [ApiVariable](./api-extractor.apivariable.md) | Represents a TypeScript variable declaration. |
|  [Excerpt](./api-extractor.excerpt.md) | This class is used by [ApiDeclaredItem](./api-extractor.apideclareditem.md) to represent a source code excerpt containing a TypeScript declaration. |
|  [ExcerptToken](./api-extractor.excerpttoken.md) |  |
|  [Extractor](./api-extractor.extractor.md) | Used to invoke the API Extractor tool. |
|  [HeritageType](./api-extractor.heritagetype.md) | Represents a type referenced via an "extends" or "implements" heritage clause for a TypeScript class. |
|  [IndentedWriter](./api-extractor.indentedwriter.md) | <b><i>(BETA)</i></b> A utility for writing indented text. |
|  [Parameter](./api-extractor.parameter.md) | Represents a named parameter for a function-like declaration. |

## Enumerations

|  Enumeration | Description |
|  --- | --- |
|  [ApiItemKind](./api-extractor.apiitemkind.md) | The type returned by the [ApiItem.kind](./api-extractor.apiitem.kind.md) property, which can be used to easily distinguish subclasses of [ApiItem](./api-extractor.apiitem.md)<!-- -->. |
|  [ExcerptTokenKind](./api-extractor.excerpttokenkind.md) |  |
|  [ExtractorValidationRulePolicy](./api-extractor.extractorvalidationrulepolicy.md) | Configuration values used for the [IExtractorValidationRulesConfig](./api-extractor.iextractorvalidationrulesconfig.md) block. |
|  [ReleaseTag](./api-extractor.releasetag.md) | A "release tag" is a custom TSDoc tag that is applied to an API to communicate the level of support provided for third-party developers. |

## Functions

|  Function | Description |
|  --- | --- |
|  [ApiItemContainerMixin(baseClass)](./api-extractor.apiitemcontainermixin.md) | Mixin function for [ApiDeclaredItem](./api-extractor.apideclareditem.md)<!-- -->. |
|  [ApiParameterListMixin(baseClass)](./api-extractor.apiparameterlistmixin.md) | Mixin function for . |
|  [ApiReleaseTagMixin(baseClass)](./api-extractor.apireleasetagmixin.md) | Mixin function for . |
|  [ApiReturnTypeMixin(baseClass)](./api-extractor.apireturntypemixin.md) | Mixin function for . |
|  [ApiStaticMixin(baseClass)](./api-extractor.apistaticmixin.md) | Mixin function for . |

## Interfaces

|  Interface | Description |
|  --- | --- |
|  [ApiItemContainerMixin](./api-extractor.apiitemcontainermixin.md) | The mixin base class for API items that act as containers for other child items. |
|  [ApiParameterListMixin](./api-extractor.apiparameterlistmixin.md) | The mixin base class for API items that can have function parameters (but not necessarily a return value). |
|  [ApiReleaseTagMixin](./api-extractor.apireleasetagmixin.md) | The mixin base class for API items that can be attributed with a TSDoc tag such as `@internal`<!-- -->, `@alpha`<!-- -->, `@beta`<!-- -->, or `@public`<!-- -->. These "release tags" indicate the support level for an API. |
|  [ApiReturnTypeMixin](./api-extractor.apireturntypemixin.md) | The mixin base class for API items that are functions that return a value. |
|  [ApiStaticMixin](./api-extractor.apistaticmixin.md) | The mixin base class for API items that can have the TypeScript `static` keyword applied to them. |
|  [IAnalyzeProjectOptions](./api-extractor.ianalyzeprojectoptions.md) | Options for [Extractor.processProject()](./api-extractor.extractor.processproject.md)<!-- -->. |
|  [IApiCallSignatureOptions](./api-extractor.iapicallsignatureoptions.md) | Constructor options for [ApiCallSignature](./api-extractor.apicallsignature.md)<!-- -->. |
|  [IApiClassOptions](./api-extractor.iapiclassoptions.md) | Constructor options for [ApiClass](./api-extractor.apiclass.md)<!-- -->. |
|  [IApiConstructorOptions](./api-extractor.iapiconstructoroptions.md) | Constructor options for [ApiConstructor](./api-extractor.apiconstructor.md)<!-- -->. |
|  [IApiConstructSignatureOptions](./api-extractor.iapiconstructsignatureoptions.md) | Constructor options for [ApiConstructor](./api-extractor.apiconstructor.md)<!-- -->. |
|  [IApiDeclaredItemOptions](./api-extractor.iapideclareditemoptions.md) | Constructor options for [ApiDeclaredItem](./api-extractor.apideclareditem.md)<!-- -->. |
|  [IApiDocumentedItemOptions](./api-extractor.iapidocumenteditemoptions.md) | Constructor options for [ApiDocumentedItem](./api-extractor.apidocumenteditem.md)<!-- -->. |
|  [IApiEntryPointOptions](./api-extractor.iapientrypointoptions.md) | Constructor options for [ApiEntryPoint](./api-extractor.apientrypoint.md)<!-- -->. |
|  [IApiEnumMemberOptions](./api-extractor.iapienummemberoptions.md) | Constructor options for [ApiEnumMember](./api-extractor.apienummember.md)<!-- -->. |
|  [IApiEnumOptions](./api-extractor.iapienumoptions.md) | Constructor options for [ApiEnum](./api-extractor.apienum.md)<!-- -->. |
|  [IApiFunctionOptions](./api-extractor.iapifunctionoptions.md) | Constructor options for [ApiFunction](./api-extractor.apifunction.md)<!-- -->. |
|  [IApiIndexSignatureOptions](./api-extractor.iapiindexsignatureoptions.md) | Constructor options for [ApiIndexSignature](./api-extractor.apiindexsignature.md)<!-- -->. |
|  [IApiInterfaceOptions](./api-extractor.iapiinterfaceoptions.md) | Constructor options for [ApiInterface](./api-extractor.apiinterface.md)<!-- -->. |
|  [IApiItemContainerMixinOptions](./api-extractor.iapiitemcontainermixinoptions.md) | Constructor options for . |
|  [IApiItemOptions](./api-extractor.iapiitemoptions.md) | Constructor options for [ApiItem](./api-extractor.apiitem.md)<!-- -->. |
|  [IApiMethodOptions](./api-extractor.iapimethodoptions.md) | Constructor options for [ApiMethod](./api-extractor.apimethod.md)<!-- -->. |
|  [IApiMethodSignatureOptions](./api-extractor.iapimethodsignatureoptions.md) |  |
|  [IApiNamespaceOptions](./api-extractor.iapinamespaceoptions.md) | Constructor options for [ApiClass](./api-extractor.apiclass.md)<!-- -->. |
|  [IApiPackageOptions](./api-extractor.iapipackageoptions.md) | Constructor options for [ApiPackage](./api-extractor.apipackage.md)<!-- -->. |
|  [IApiParameterListMixinOptions](./api-extractor.iapiparameterlistmixinoptions.md) | Constructor options for . |
|  [IApiPropertyItemOptions](./api-extractor.iapipropertyitemoptions.md) | Constructor options for [ApiPropertyItem](./api-extractor.apipropertyitem.md)<!-- -->. |
|  [IApiPropertyOptions](./api-extractor.iapipropertyoptions.md) | Constructor options for [ApiProperty](./api-extractor.apiproperty.md)<!-- -->. |
|  [IApiPropertySignatureOptions](./api-extractor.iapipropertysignatureoptions.md) | Constructor options for [ApiPropertySignature](./api-extractor.apipropertysignature.md)<!-- -->. |
|  [IApiReleaseTagMixinOptions](./api-extractor.iapireleasetagmixinoptions.md) | Constructor options for . |
|  [IApiReturnTypeMixinOptions](./api-extractor.iapireturntypemixinoptions.md) | Constructor options for . |
|  [IApiStaticMixinOptions](./api-extractor.iapistaticmixinoptions.md) | Constructor options for [IApiStaticMixinOptions](./api-extractor.iapistaticmixinoptions.md)<!-- -->. |
|  [IApiTypeAliasOptions](./api-extractor.iapitypealiasoptions.md) | Constructor options for [ApiTypeAlias](./api-extractor.apitypealias.md)<!-- -->. |
|  [IApiVariableOptions](./api-extractor.iapivariableoptions.md) | Constructor options for [ApiVariable](./api-extractor.apivariable.md)<!-- -->. |
|  [IExcerptToken](./api-extractor.iexcerpttoken.md) |  |
|  [IExcerptTokenRange](./api-extractor.iexcerpttokenrange.md) |  |
|  [IExtractorApiJsonFileConfig](./api-extractor.iextractorapijsonfileconfig.md) | Configures how the API JSON files (\*.api.json) will be generated. |
|  [IExtractorApiReviewFileConfig](./api-extractor.iextractorapireviewfileconfig.md) | Configures how the API review files (\*.api.ts) will be generated. |
|  [IExtractorConfig](./api-extractor.iextractorconfig.md) | Configuration options for the API Extractor tool. These options can be loaded from a JSON config file. |
|  [IExtractorDtsRollupConfig](./api-extractor.iextractordtsrollupconfig.md) | <b><i>(BETA)</i></b> Configures how the \*.d.ts rollup files will be generated. |
|  [IExtractorOptions](./api-extractor.iextractoroptions.md) | Runtime options for Extractor. |
|  [IExtractorPoliciesConfig](./api-extractor.iextractorpoliciesconfig.md) | These policies determine how API Extractor validates various best practices for API design. |
|  [IExtractorProjectConfig](./api-extractor.iextractorprojectconfig.md) | Describes a specific project that will be analyzed. In principle, multiple individual projects can be processed while reusing a common compiler state. |
|  [IExtractorRuntimeCompilerConfig](./api-extractor.iextractorruntimecompilerconfig.md) | With this configuration, API Extractor is configured using an already prepared compiler state that is provided programmatically at runtime. This can potentially enable faster builds, by reusing the same compiler invocation for tsc, tslint, and API Extractor.<!-- -->If configType='runtime' is specified, then IExtractorRuntimeOptions.compilerProgram must be provided. |
|  [IExtractorTsconfigCompilerConfig](./api-extractor.iextractortsconfigcompilerconfig.md) | With this configuration, API Extractor configures the compiler based on settings that it finds in the project's tsconfig.json file. |
|  [IExtractorValidationRulesConfig](./api-extractor.iextractorvalidationrulesconfig.md) | Configuration for various validation checks that ensure good API design |
|  [ILogger](./api-extractor.ilogger.md) | Provides a custom logging service to API Extractor. |
|  [IParameterOptions](./api-extractor.iparameteroptions.md) | Constructor options for [Parameter](./api-extractor.parameter.md)<!-- -->. |
|  [IResolveDeclarationReferenceResult](./api-extractor.iresolvedeclarationreferenceresult.md) | Result object for [ApiModel.resolveDeclarationReference()](./api-extractor.apimodel.resolvedeclarationreference.md)<!-- -->. |

## Namespaces

|  Namespace | Description |
|  --- | --- |
|  [ApiItemContainerMixin](./api-extractor.apiitemcontainermixin.md) | Static members for . |
|  [ApiParameterListMixin](./api-extractor.apiparameterlistmixin.md) | Static members for . |
|  [ApiReleaseTagMixin](./api-extractor.apireleasetagmixin.md) | Static members for . |
|  [ApiReturnTypeMixin](./api-extractor.apireturntypemixin.md) | Static members for . |
|  [ApiStaticMixin](./api-extractor.apistaticmixin.md) | Static members for . |

## Type Aliases

|  Type Alias | Description |
|  --- | --- |
|  [Constructor](./api-extractor.constructor.md) |  |
|  [PropertiesOf](./api-extractor.propertiesof.md) |  |

