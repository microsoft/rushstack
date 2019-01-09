[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IExtractorConfig](./api-extractor.iextractorconfig.md)

## IExtractorConfig interface

Configuration options for the API Extractor tool. These options can be loaded from a JSON config file.

<b>Signature:</b>

```typescript
export interface IExtractorConfig 
```

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [apiJsonFile](./api-extractor.iextractorconfig.apijsonfile.md) | `IExtractorApiJsonFileConfig` |  |
|  [apiReviewFile](./api-extractor.iextractorconfig.apireviewfile.md) | `IExtractorApiReviewFileConfig` |  |
|  [compiler](./api-extractor.iextractorconfig.compiler.md) | `IExtractorTsconfigCompilerConfig | IExtractorRuntimeCompilerConfig` | Determines how the TypeScript compiler will be invoked. The compiler.configType selects the type of configuration; Different options are available according to the configuration type. |
|  [dtsRollup](./api-extractor.iextractorconfig.dtsrollup.md) | `IExtractorDtsRollupConfig` | <b><i>(BETA)</i></b> |
|  [extends](./api-extractor.iextractorconfig.extends.md) | `string` | Path to json config file from which config should extend. The path specified in this field is relative to current config file path. |
|  [policies](./api-extractor.iextractorconfig.policies.md) | `IExtractorPoliciesConfig` |  |
|  [project](./api-extractor.iextractorconfig.project.md) | `IExtractorProjectConfig` |  |
|  [validationRules](./api-extractor.iextractorconfig.validationrules.md) | `IExtractorValidationRulesConfig` |  |

