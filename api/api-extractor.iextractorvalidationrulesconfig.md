[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IExtractorValidationRulesConfig](./api-extractor.iextractorvalidationrulesconfig.md)

## IExtractorValidationRulesConfig interface

Configuration for various validation checks that ensure good API design

<b>Signature:</b>

```typescript
export interface IExtractorValidationRulesConfig 
```

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [missingReleaseTags](./api-extractor.iextractorvalidationrulesconfig.missingreleasetags.md) | `ExtractorValidationRulePolicy` | This rule checks for top-level API items that are missing a release tag such as @<!-- -->beta or @<!-- -->internal. If "allow" is chosen, then missing release tags will be assumed to be @<!-- -->public. The default policy is "error". |

