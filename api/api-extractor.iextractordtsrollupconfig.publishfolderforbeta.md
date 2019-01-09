[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IExtractorDtsRollupConfig](./api-extractor.iextractordtsrollupconfig.md) &gt; [publishFolderForBeta](./api-extractor.iextractordtsrollupconfig.publishfolderforbeta.md)

## IExtractorDtsRollupConfig.publishFolderForBeta property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

This setting is only used if "trimming" is true. It indicates the folder where "npm publish" will be run for a beta release. The default value is "./dist/beta".

<b>Signature:</b>

```typescript
publishFolderForBeta?: string;
```

## Remarks

A beta release will contain all definitions that are reachable from the entry point, except definitions marked as @<!-- -->alpha or @<!-- -->internal.

