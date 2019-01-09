[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md)

## api-extractor package

API Extractor helps you build better TypeScript library packages. It helps with validation, documentation, and reviewing of the exported API for a TypeScript library.

## Classes

|  <p>Class</p> | <p>Description</p> |
|  --- | --- |
|  <p>[ApiCallSignature](./api-extractor.apicallsignature.md)</p> | <p>Represents a TypeScript function call signature.</p> |
|  <p>[ApiClass](./api-extractor.apiclass.md)</p> | <p>Represents a TypeScript class declaration.</p> |
|  <p>[ApiConstructor](./api-extractor.apiconstructor.md)</p> | <p>Represents a TypeScript class constructor declaration that belongs to an `ApiClass`<!-- -->.</p> |
|  <p>[ApiConstructSignature](./api-extractor.apiconstructsignature.md)</p> | <p>Represents a TypeScript construct signature that belongs to an `ApiInterface`<!-- -->.</p> |
|  <p>[ApiDeclaredItem](./api-extractor.apideclareditem.md)</p> | <p>The base class for API items that have an associated source code excerpt containing a TypeScript declaration.</p> |
|  <p>[ApiDocumentedItem](./api-extractor.apidocumenteditem.md)</p> | <p>An abstract base class for API declarations that can have an associated TSDoc comment.</p> |
|  <p>[ApiEntryPoint](./api-extractor.apientrypoint.md)</p> | <p>Represents the entry point for an NPM package.</p> |
|  <p>[ApiEnum](./api-extractor.apienum.md)</p> | <p>Represents a TypeScript enum declaration.</p> |
|  <p>[ApiEnumMember](./api-extractor.apienummember.md)</p> | <p>Represents a member of a TypeScript enum declaration.</p> |
|  <p>[ApiFunction](./api-extractor.apifunction.md)</p> | <p>Represents a TypeScript function declaration.</p> |
|  <p>[ApiIndexSignature](./api-extractor.apiindexsignature.md)</p> | <p>Represents a TypeScript index signature.</p> |
|  <p>[ApiInterface](./api-extractor.apiinterface.md)</p> | <p>Represents a TypeScript class declaration.</p> |
|  <p>[ApiItem](./api-extractor.apiitem.md)</p> | <p>The abstract base class for all members of an `ApiModel` object.</p> |
|  <p>[ApiMethod](./api-extractor.apimethod.md)</p> | <p>Represents a TypeScript member function declaration that belongs to an `ApiClass`<!-- -->.</p> |
|  <p>[ApiMethodSignature](./api-extractor.apimethodsignature.md)</p> | <p>Represents a TypeScript member function declaration that belongs to an `ApiInterface`<!-- -->.</p> |
|  <p>[ApiModel](./api-extractor.apimodel.md)</p> | <p>A serializable representation of a collection of API declarations.</p> |
|  <p>[ApiNamespace](./api-extractor.apinamespace.md)</p> | <p>Represents a TypeScript namespace declaration.</p> |
|  <p>[ApiPackage](./api-extractor.apipackage.md)</p> | <p>Represents an NPM package containing API declarations.</p> |
|  <p>[ApiProperty](./api-extractor.apiproperty.md)</p> | <p>Represents a TypeScript property declaration that belongs to an `ApiClass`<!-- -->.</p> |
|  <p>[ApiPropertyItem](./api-extractor.apipropertyitem.md)</p> | <p>The abstract base class for [ApiProperty](./api-extractor.apiproperty.md) and [ApiPropertySignature](./api-extractor.apipropertysignature.md)<!-- -->.</p> |
|  <p>[ApiPropertySignature](./api-extractor.apipropertysignature.md)</p> | <p>Represents a TypeScript property declaration that belongs to an `ApiInterface`<!-- -->.</p> |
|  <p>[ApiTypeAlias](./api-extractor.apitypealias.md)</p> | <p>Represents a TypeScript type alias declaration.</p> |
|  <p>[ApiVariable](./api-extractor.apivariable.md)</p> | <p>Represents a TypeScript variable declaration.</p> |
|  <p>[Excerpt](./api-extractor.excerpt.md)</p> | <p>This class is used by [ApiDeclaredItem](./api-extractor.apideclareditem.md) to represent a source code excerpt containing a TypeScript declaration.</p> |
|  <p>[ExcerptToken](./api-extractor.excerpttoken.md)</p> | <p></p> |
|  <p>[Extractor](./api-extractor.extractor.md)</p> | <p>Used to invoke the API Extractor tool.</p> |
|  <p>[HeritageType](./api-extractor.heritagetype.md)</p> | <p>Represents a type referenced via an "extends" or "implements" heritage clause for a TypeScript class.</p> |
|  <p>[IndentedWriter](./api-extractor.indentedwriter.md)</p> | <p><b><i>(BETA)</i></b> A utility for writing indented text.</p> |
|  <p>[Parameter](./api-extractor.parameter.md)</p> | <p>Represents a named parameter for a function-like declaration.</p> |

## Enumerations

|  <p>Enumeration</p> | <p>Description</p> |
|  --- | --- |
|  <p>[ApiItemKind](./api-extractor.apiitemkind.md)</p> | <p>The type returned by the [ApiItem.kind](./api-extractor.apiitem.kind.md) property, which can be used to easily distinguish subclasses of [ApiItem](./api-extractor.apiitem.md)<!-- -->.</p> |
|  <p>[ExcerptTokenKind](./api-extractor.excerpttokenkind.md)</p> | <p></p> |
|  <p>[ExtractorValidationRulePolicy](./api-extractor.extractorvalidationrulepolicy.md)</p> | <p>Configuration values used for the [IExtractorValidationRulesConfig](./api-extractor.iextractorvalidationrulesconfig.md) block.</p> |
|  <p>[ReleaseTag](./api-extractor.releasetag.md)</p> | <p>A "release tag" is a custom TSDoc tag that is applied to an API to communicate the level of support provided for third-party developers.</p> |

## Functions

|  <p>Function</p> | <p>Description</p> |
|  --- | --- |
|  <p>[ApiItemContainerMixin(baseClass)](./api-extractor.apiitemcontainermixin.md)</p> | <p>Mixin function for [ApiDeclaredItem](./api-extractor.apideclareditem.md)<!-- -->.</p> |
|  <p>[ApiParameterListMixin(baseClass)](./api-extractor.apiparameterlistmixin.md)</p> | <p>Mixin function for .</p> |
|  <p>[ApiReleaseTagMixin(baseClass)](./api-extractor.apireleasetagmixin.md)</p> | <p>Mixin function for .</p> |
|  <p>[ApiReturnTypeMixin(baseClass)](./api-extractor.apireturntypemixin.md)</p> | <p>Mixin function for .</p> |
|  <p>[ApiStaticMixin(baseClass)](./api-extractor.apistaticmixin.md)</p> | <p>Mixin function for .</p> |

## Interfaces

|  <p>Interface</p> | <p>Description</p> |
|  --- | --- |
|  <p>[ApiItemContainerMixin](./api-extractor.apiitemcontainermixin.md)</p> | <p>The mixin base class for API items that act as containers for other child items.</p> |
|  <p>[ApiParameterListMixin](./api-extractor.apiparameterlistmixin.md)</p> | <p>The mixin base class for API items that can have function parameters (but not necessarily a return value).</p> |
|  <p>[ApiReleaseTagMixin](./api-extractor.apireleasetagmixin.md)</p> | <p>The mixin base class for API items that can be attributed with a TSDoc tag such as `@internal`<!-- -->, `@alpha`<!-- -->, `@beta`<!-- -->, or `@public`<!-- -->. These "release tags" indicate the support level for an API.</p> |
|  <p>[ApiReturnTypeMixin](./api-extractor.apireturntypemixin.md)</p> | <p>The mixin base class for API items that are functions that return a value.</p> |
|  <p>[ApiStaticMixin](./api-extractor.apistaticmixin.md)</p> | <p>The mixin base class for API items that can have the TypeScript `static` keyword applied to them.</p> |
|  <p>[IAnalyzeProjectOptions](./api-extractor.ianalyzeprojectoptions.md)</p> | <p>Options for [Extractor.processProject()](./api-extractor.extractor.processproject.md)<!-- -->.</p> |
|  <p>[IApiCallSignatureOptions](./api-extractor.iapicallsignatureoptions.md)</p> | <p>Constructor options for [ApiCallSignature](./api-extractor.apicallsignature.md)<!-- -->.</p> |
|  <p>[IApiClassOptions](./api-extractor.iapiclassoptions.md)</p> | <p>Constructor options for [ApiClass](./api-extractor.apiclass.md)<!-- -->.</p> |
|  <p>[IApiConstructorOptions](./api-extractor.iapiconstructoroptions.md)</p> | <p>Constructor options for [ApiConstructor](./api-extractor.apiconstructor.md)<!-- -->.</p> |
|  <p>[IApiConstructSignatureOptions](./api-extractor.iapiconstructsignatureoptions.md)</p> | <p>Constructor options for [ApiConstructor](./api-extractor.apiconstructor.md)<!-- -->.</p> |
|  <p>[IApiDeclaredItemOptions](./api-extractor.iapideclareditemoptions.md)</p> | <p>Constructor options for [ApiDeclaredItem](./api-extractor.apideclareditem.md)<!-- -->.</p> |
|  <p>[IApiDocumentedItemOptions](./api-extractor.iapidocumenteditemoptions.md)</p> | <p>Constructor options for [ApiDocumentedItem](./api-extractor.apidocumenteditem.md)<!-- -->.</p> |
|  <p>[IApiEntryPointOptions](./api-extractor.iapientrypointoptions.md)</p> | <p>Constructor options for [ApiEntryPoint](./api-extractor.apientrypoint.md)<!-- -->.</p> |
|  <p>[IApiEnumMemberOptions](./api-extractor.iapienummemberoptions.md)</p> | <p>Constructor options for [ApiEnumMember](./api-extractor.apienummember.md)<!-- -->.</p> |
|  <p>[IApiEnumOptions](./api-extractor.iapienumoptions.md)</p> | <p>Constructor options for [ApiEnum](./api-extractor.apienum.md)<!-- -->.</p> |
|  <p>[IApiFunctionOptions](./api-extractor.iapifunctionoptions.md)</p> | <p>Constructor options for [ApiFunction](./api-extractor.apifunction.md)<!-- -->.</p> |
|  <p>[IApiIndexSignatureOptions](./api-extractor.iapiindexsignatureoptions.md)</p> | <p>Constructor options for [ApiIndexSignature](./api-extractor.apiindexsignature.md)<!-- -->.</p> |
|  <p>[IApiInterfaceOptions](./api-extractor.iapiinterfaceoptions.md)</p> | <p>Constructor options for [ApiInterface](./api-extractor.apiinterface.md)<!-- -->.</p> |
|  <p>[IApiItemContainerMixinOptions](./api-extractor.iapiitemcontainermixinoptions.md)</p> | <p>Constructor options for .</p> |
|  <p>[IApiItemOptions](./api-extractor.iapiitemoptions.md)</p> | <p>Constructor options for [ApiItem](./api-extractor.apiitem.md)<!-- -->.</p> |
|  <p>[IApiMethodOptions](./api-extractor.iapimethodoptions.md)</p> | <p>Constructor options for [ApiMethod](./api-extractor.apimethod.md)<!-- -->.</p> |
|  <p>[IApiMethodSignatureOptions](./api-extractor.iapimethodsignatureoptions.md)</p> | <p></p> |
|  <p>[IApiNamespaceOptions](./api-extractor.iapinamespaceoptions.md)</p> | <p>Constructor options for [ApiClass](./api-extractor.apiclass.md)<!-- -->.</p> |
|  <p>[IApiPackageOptions](./api-extractor.iapipackageoptions.md)</p> | <p>Constructor options for [ApiPackage](./api-extractor.apipackage.md)<!-- -->.</p> |
|  <p>[IApiParameterListMixinOptions](./api-extractor.iapiparameterlistmixinoptions.md)</p> | <p>Constructor options for .</p> |
|  <p>[IApiPropertyItemOptions](./api-extractor.iapipropertyitemoptions.md)</p> | <p>Constructor options for [ApiPropertyItem](./api-extractor.apipropertyitem.md)<!-- -->.</p> |
|  <p>[IApiPropertyOptions](./api-extractor.iapipropertyoptions.md)</p> | <p>Constructor options for [ApiProperty](./api-extractor.apiproperty.md)<!-- -->.</p> |
|  <p>[IApiPropertySignatureOptions](./api-extractor.iapipropertysignatureoptions.md)</p> | <p>Constructor options for [ApiPropertySignature](./api-extractor.apipropertysignature.md)<!-- -->.</p> |
|  <p>[IApiReleaseTagMixinOptions](./api-extractor.iapireleasetagmixinoptions.md)</p> | <p>Constructor options for .</p> |
|  <p>[IApiReturnTypeMixinOptions](./api-extractor.iapireturntypemixinoptions.md)</p> | <p>Constructor options for .</p> |
|  <p>[IApiStaticMixinOptions](./api-extractor.iapistaticmixinoptions.md)</p> | <p>Constructor options for [IApiStaticMixinOptions](./api-extractor.iapistaticmixinoptions.md)<!-- -->.</p> |
|  <p>[IApiTypeAliasOptions](./api-extractor.iapitypealiasoptions.md)</p> | <p>Constructor options for [ApiTypeAlias](./api-extractor.apitypealias.md)<!-- -->.</p> |
|  <p>[IApiVariableOptions](./api-extractor.iapivariableoptions.md)</p> | <p>Constructor options for [ApiVariable](./api-extractor.apivariable.md)<!-- -->.</p> |
|  <p>[IExcerptToken](./api-extractor.iexcerpttoken.md)</p> | <p></p> |
|  <p>[IExcerptTokenRange](./api-extractor.iexcerpttokenrange.md)</p> | <p></p> |
|  <p>[IExtractorApiJsonFileConfig](./api-extractor.iextractorapijsonfileconfig.md)</p> | <p>Configures how the API JSON files (\*.api.json) will be generated.</p> |
|  <p>[IExtractorApiReviewFileConfig](./api-extractor.iextractorapireviewfileconfig.md)</p> | <p>Configures how the API review files (\*.api.ts) will be generated.</p> |
|  <p>[IExtractorConfig](./api-extractor.iextractorconfig.md)</p> | <p>Configuration options for the API Extractor tool. These options can be loaded from a JSON config file.</p> |
|  <p>[IExtractorDtsRollupConfig](./api-extractor.iextractordtsrollupconfig.md)</p> | <p><b><i>(BETA)</i></b> Configures how the \*.d.ts rollup files will be generated.</p> |
|  <p>[IExtractorOptions](./api-extractor.iextractoroptions.md)</p> | <p>Runtime options for Extractor.</p> |
|  <p>[IExtractorPoliciesConfig](./api-extractor.iextractorpoliciesconfig.md)</p> | <p>These policies determine how API Extractor validates various best practices for API design.</p> |
|  <p>[IExtractorProjectConfig](./api-extractor.iextractorprojectconfig.md)</p> | <p>Describes a specific project that will be analyzed. In principle, multiple individual projects can be processed while reusing a common compiler state.</p> |
|  <p>[IExtractorRuntimeCompilerConfig](./api-extractor.iextractorruntimecompilerconfig.md)</p> | <p>With this configuration, API Extractor is configured using an already prepared compiler state that is provided programmatically at runtime. This can potentially enable faster builds, by reusing the same compiler invocation for tsc, tslint, and API Extractor.</p><p>If configType='runtime' is specified, then IExtractorRuntimeOptions.compilerProgram must be provided.</p> |
|  <p>[IExtractorTsconfigCompilerConfig](./api-extractor.iextractortsconfigcompilerconfig.md)</p> | <p>With this configuration, API Extractor configures the compiler based on settings that it finds in the project's tsconfig.json file.</p> |
|  <p>[IExtractorValidationRulesConfig](./api-extractor.iextractorvalidationrulesconfig.md)</p> | <p>Configuration for various validation checks that ensure good API design</p> |
|  <p>[ILogger](./api-extractor.ilogger.md)</p> | <p>Provides a custom logging service to API Extractor.</p> |
|  <p>[IParameterOptions](./api-extractor.iparameteroptions.md)</p> | <p>Constructor options for [Parameter](./api-extractor.parameter.md)<!-- -->.</p> |
|  <p>[IResolveDeclarationReferenceResult](./api-extractor.iresolvedeclarationreferenceresult.md)</p> | <p>Result object for [ApiModel.resolveDeclarationReference()](./api-extractor.apimodel.resolvedeclarationreference.md)<!-- -->.</p> |

## Namespaces

|  <p>Namespace</p> | <p>Description</p> |
|  --- | --- |
|  <p>[ApiItemContainerMixin](./api-extractor.apiitemcontainermixin.md)</p> | <p>Static members for .</p> |
|  <p>[ApiParameterListMixin](./api-extractor.apiparameterlistmixin.md)</p> | <p>Static members for .</p> |
|  <p>[ApiReleaseTagMixin](./api-extractor.apireleasetagmixin.md)</p> | <p>Static members for .</p> |
|  <p>[ApiReturnTypeMixin](./api-extractor.apireturntypemixin.md)</p> | <p>Static members for .</p> |
|  <p>[ApiStaticMixin](./api-extractor.apistaticmixin.md)</p> | <p>Static members for .</p> |

## Type Aliases

|  <p>Type Alias</p> | <p>Description</p> |
|  --- | --- |
|  <p>[Constructor](./api-extractor.constructor.md)</p> |  |
|  <p>[PropertiesOf](./api-extractor.propertiesof.md)</p> |  |

