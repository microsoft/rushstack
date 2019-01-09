[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IExtractorValidationRulesConfig](./api-extractor.iextractorvalidationrulesconfig.md) &gt; [missingReleaseTags](./api-extractor.iextractorvalidationrulesconfig.missingreleasetags.md)

## IExtractorValidationRulesConfig.missingReleaseTags property

This rule checks for top-level API items that are missing a release tag such as @<!-- -->beta or @<!-- -->internal. If "allow" is chosen, then missing release tags will be assumed to be @<!-- -->public. The default policy is "error".

<b>Signature:</b>

```typescript
missingReleaseTags?: ExtractorValidationRulePolicy;
```
