[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md)

# api-extractor package

API Extractor helps you build better TypeScript library packages. It helps with validation, documentation, and reviewing of the exported API for a TypeScript library.

## Classes

|  Class | Description |
|  --- | --- |
|  [`ApiJsonFile`](./api-extractor.apijsonfile.md) | Support for loading the \*.api.json file. |
|  [`ExternalApiHelper`](./api-extractor.externalapihelper.md) | **_(BETA)_** ExternalApiHelper has the specific use case of generating an API json file from third-party definition files. This class is invoked by the gulp-core-build-typescript gulpfile, where the external package names are hard wired. The job of this method is almost the same as the API Extractor task that is executed on first party packages, with the exception that all packages analyzed here are external packages with definition files. |
|  [`Extractor`](./api-extractor.extractor.md) | Used to invoke the API Extractor tool. |
|  [`Markup`](./api-extractor.markup.md) | Provides various operations for working with MarkupElement objects. |

## Interfaces

|  Interface | Description |
|  --- | --- |
|  [`IAnalyzeProjectOptions`](./api-extractor.ianalyzeprojectoptions.md) | Options for [Extractor.processProject](./api-extractor.extractor.processproject.md)<!-- -->. |
|  [`IExtractorApiJsonFileConfig`](./api-extractor.iextractorapijsonfileconfig.md) | Configures how the API JSON files (\*.api.json) will be generated. |
|  [`IExtractorApiReviewFileConfig`](./api-extractor.iextractorapireviewfileconfig.md) | Configures how the API review files (\*.api.ts) will be generated. |
|  [`IExtractorConfig`](./api-extractor.iextractorconfig.md) | Configuration options for the API Extractor tool. These options can be loaded from a JSON config file. |
|  [`IExtractorDtsRollupConfig`](./api-extractor.iextractordtsrollupconfig.md) | **_(BETA)_** Configures how the \*.d.ts rollup files will be generated. |
|  [`IExtractorOptions`](./api-extractor.iextractoroptions.md) | Runtime options for Extractor. |
|  [`IExtractorPoliciesConfig`](./api-extractor.iextractorpoliciesconfig.md) | These policies determine how API Extractor validates various best practices for API design. |
|  [`IExtractorProjectConfig`](./api-extractor.iextractorprojectconfig.md) | Describes a specific project that will be analyzed. In principle, multiple individual projects can be processed while reusing a common compiler state. |
|  [`IExtractorRuntimeCompilerConfig`](./api-extractor.iextractorruntimecompilerconfig.md) | With this configuration, API Extractor is configured using an already prepared compiler state that is provided programmatically at runtime. This can potentially enable faster builds, by reusing the same compiler invocation for tsc, tslint, and API Extractor.<p/>If configType='runtime' is specified, then IExtractorRuntimeOptions.compilerProgram must be provided. |
|  [`IExtractorTsconfigCompilerConfig`](./api-extractor.iextractortsconfigcompilerconfig.md) | With this configuration, API Extractor configures the compiler based on settings that it finds in the project's tsconfig.json file. |
|  [`IExtractorValidationRulesConfig`](./api-extractor.iextractorvalidationrulesconfig.md) | Configuration for various validation checks that ensure good API design |
|  [`ILogger`](./api-extractor.ilogger.md) | Provides a custom logging service to API Extractor. |
|  [`IMarkupApiLink`](./api-extractor.imarkupapilink.md) | A hyperlink to an API item |
|  [`IMarkupCodeBox`](./api-extractor.imarkupcodebox.md) | A box containing source code with syntax highlighting |
|  [`IMarkupCreateTextOptions`](./api-extractor.imarkupcreatetextoptions.md) | Options for [Markup.createTextElements](./api-extractor.markup.createtextelements.md) |
|  [`IMarkupHeading1`](./api-extractor.imarkupheading1.md) | A top-level heading |
|  [`IMarkupHeading2`](./api-extractor.imarkupheading2.md) | A sub heading |
|  [`IMarkupHighlightedText`](./api-extractor.imarkuphighlightedtext.md) | Source code shown in a fixed-width font, with syntax highlighting. |
|  [`IMarkupHtmlTag`](./api-extractor.imarkuphtmltag.md) | Represents an HTML tag such as \`<td>\` or \`</td>\` or \`<img src="example.gif" />\`. |
|  [`IMarkupLineBreak`](./api-extractor.imarkuplinebreak.md) | A line break, similar to the "<br>" tag in HTML. |
|  [`IMarkupNoteBox`](./api-extractor.imarkupnotebox.md) | A call-out box containing an informational note |
|  [`IMarkupPage`](./api-extractor.imarkuppage.md) | Represents an entire page. |
|  [`IMarkupParagraph`](./api-extractor.imarkupparagraph.md) | A paragraph separator, similar to the "<p>" tag in HTML |
|  [`IMarkupTable`](./api-extractor.imarkuptable.md) | A table, with an optional header row |
|  [`IMarkupTableCell`](./api-extractor.imarkuptablecell.md) | A cell inside an IMarkupTableRow element. |
|  [`IMarkupTableRow`](./api-extractor.imarkuptablerow.md) | A row inside an IMarkupTable element. |
|  [`IMarkupText`](./api-extractor.imarkuptext.md) | A block of plain text, possibly with simple formatting such as bold or italics. |
|  [`IMarkupWebLink`](./api-extractor.imarkupweblink.md) | A hyperlink to an internet URL |

## Enumerations

|  Enumeration | Description |
|  --- | --- |
|  [`ExtractorValidationRulePolicy`](./api-extractor.extractorvalidationrulepolicy.md) | Configuration values used for the [IExtractorValidationRulesConfig](./api-extractor.iextractorvalidationrulesconfig.md) block. |

