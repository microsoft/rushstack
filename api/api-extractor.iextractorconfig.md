[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IExtractorConfig](./api-extractor.iextractorconfig.md)

# IExtractorConfig interface

Configuration options for the API Extractor tool. These options can be loaded from a JSON config file.

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [`apiJsonFile`](./api-extractor.iextractorconfig.apijsonfile.md) | `IExtractorApiJsonFileConfig` | Configures how the API JSON files (\*.api.json) will be generated. |
|  [`apiReviewFile`](./api-extractor.iextractorconfig.apireviewfile.md) | `IExtractorApiReviewFileConfig` | Configures how the API review files (\*.api.ts) will be generated. |
|  [`compiler`](./api-extractor.iextractorconfig.compiler.md) | `IExtractorTsconfigCompilerConfig | IExtractorRuntimeCompilerConfig` | Determines how the TypeScript compiler will be invoked. The compiler.configType selects the type of configuration; Different options are available according to the configuration type. |
|  [`packageTypings`](./api-extractor.iextractorconfig.packagetypings.md) | `IExtractorPackageTypingsConfig` | Configures how the package typings (\*.d.ts) will be generated. |
|  [`policies`](./api-extractor.iextractorconfig.policies.md) | `IExtractorPoliciesConfig` | These policies determine how API Extractor validates various best practices for API design. |
|  [`project`](./api-extractor.iextractorconfig.project.md) | `IExtractorProjectConfig` | Describes a specific project that will be analyzed. In principle, multiple individual projects can be processed while reusing a common compiler state. |

