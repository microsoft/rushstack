[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IExtractorDtsRollupConfig](./api-extractor.iextractordtsrollupconfig.md) &gt; [publishFolderForInternal](./api-extractor.iextractordtsrollupconfig.publishfolderforinternal.md)

## IExtractorDtsRollupConfig.publishFolderForInternal property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

This setting is only used if "trimming" is true. It indicates the folder where "npm publish" will be run for an internal release. The default value is "./dist/internal".

<b>Signature:</b>

```typescript
publishFolderForInternal?: string;
```

## Remarks

An internal release will contain all definitions that are reachable from the entry point.

