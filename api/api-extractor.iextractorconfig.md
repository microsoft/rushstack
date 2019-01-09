[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IExtractorConfig](./api-extractor.iextractorconfig.md)

## IExtractorConfig interface

Configuration options for the API Extractor tool. These options can be loaded from a JSON config file.

<b>Signature:</b>

```typescript
export interface IExtractorConfig 
```

## Properties

|  <p>Property</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[apiJsonFile](./api-extractor.iextractorconfig.apijsonfile.md)</p> | <p>`IExtractorApiJsonFileConfig`</p> | <p></p> |
|  <p>[apiReviewFile](./api-extractor.iextractorconfig.apireviewfile.md)</p> | <p>`IExtractorApiReviewFileConfig`</p> | <p></p> |
|  <p>[compiler](./api-extractor.iextractorconfig.compiler.md)</p> | <p>`IExtractorTsconfigCompilerConfig | IExtractorRuntimeCompilerConfig`</p> | <p>Determines how the TypeScript compiler will be invoked. The compiler.configType selects the type of configuration; Different options are available according to the configuration type.</p> |
|  <p>[dtsRollup](./api-extractor.iextractorconfig.dtsrollup.md)</p> | <p>`IExtractorDtsRollupConfig`</p> | <p><b><i>(BETA)</i></b></p> |
|  <p>[extends](./api-extractor.iextractorconfig.extends.md)</p> | <p>`string`</p> | <p>Path to json config file from which config should extend. The path specified in this field is relative to current config file path.</p> |
|  <p>[policies](./api-extractor.iextractorconfig.policies.md)</p> | <p>`IExtractorPoliciesConfig`</p> | <p></p> |
|  <p>[project](./api-extractor.iextractorconfig.project.md)</p> | <p>`IExtractorProjectConfig`</p> | <p></p> |
|  <p>[validationRules](./api-extractor.iextractorconfig.validationrules.md)</p> | <p>`IExtractorValidationRulesConfig`</p> | <p></p> |

