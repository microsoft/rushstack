[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IExtractorDtsRollupConfig](./api-extractor.iextractordtsrollupconfig.md) &gt; [trimming](./api-extractor.iextractordtsrollupconfig.trimming.md)

## IExtractorDtsRollupConfig.trimming property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

If "trimming" is false (the default), then a single \*.d.ts rollup file will be generated in the "publishFolder". If "trimming" is true, then three separate \*.d.ts rollups will be generated in "publishFolderForInternal", "publishFolderForBeta", and "publishFolderForPublic".

<b>Signature:</b>

```typescript
trimming?: boolean;
```

## Remarks

In either case, "mainDtsRollupPath" indicates the relative file path.

